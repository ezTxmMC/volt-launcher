package app.voltlauncher.core.nbt;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * A minimal reader and writer for Minecraft's named binary tag format.
 *
 * <p>The launcher needs it for exactly two files — {@code level.dat}, which names a world and
 * records when it was last played, and {@code servers.dat}, which holds the in-game server list —
 * so this covers the tag types those use rather than the whole specification's edge cases.
 * Compression is detected from the file's first bytes, because {@code level.dat} is gzipped and
 * {@code servers.dat} is not.
 */
public final class Nbt {

    public static final int TAG_END = 0;
    public static final int TAG_BYTE = 1;
    public static final int TAG_SHORT = 2;
    public static final int TAG_INT = 3;
    public static final int TAG_LONG = 4;
    public static final int TAG_FLOAT = 5;
    public static final int TAG_DOUBLE = 6;
    public static final int TAG_BYTE_ARRAY = 7;
    public static final int TAG_STRING = 8;
    public static final int TAG_LIST = 9;
    public static final int TAG_COMPOUND = 10;
    public static final int TAG_INT_ARRAY = 11;
    public static final int TAG_LONG_ARRAY = 12;

    /** Guards against a corrupt length field asking for gigabytes of array. */
    private static final int MAX_ARRAY_LENGTH = 16 * 1024 * 1024;

    private Nbt() {}

    /** Root of a parsed file: the root compound plus whether the file on disk was gzipped. */
    public record Document(String rootName, NbtCompound root, boolean gzipped) {}

    public static Document read(Path file) throws IOException {
        byte[] raw = Files.readAllBytes(file);
        boolean gzipped = raw.length >= 2 && (raw[0] & 0xFF) == 0x1F && (raw[1] & 0xFF) == 0x8B;
        try (InputStream base = gzipped
                ? new GZIPInputStream(new java.io.ByteArrayInputStream(raw))
                : new java.io.ByteArrayInputStream(raw);
             DataInputStream in = new DataInputStream(new BufferedInputStream(base))) {

            int type = in.readUnsignedByte();
            if (type != TAG_COMPOUND) {
                throw new IOException("Not an NBT file: root tag is " + type);
            }
            String name = in.readUTF();
            return new Document(name, readCompound(in), gzipped);
        } catch (EOFException e) {
            throw new IOException("Truncated NBT file: " + file.getFileName(), e);
        }
    }

    /** Writes a document back, preserving whether it was gzipped, through a temporary file. */
    public static void write(Path file, Document document) throws IOException {
        Files.createDirectories(file.getParent());
        Path temp = Files.createTempFile(file.getParent(), "nbt-", ".tmp");
        try {
            try (OutputStream fileOut = Files.newOutputStream(temp);
                 OutputStream base = document.gzipped() ? new GZIPOutputStream(fileOut) : fileOut;
                 DataOutputStream out = new DataOutputStream(new BufferedOutputStream(base))) {

                out.writeByte(TAG_COMPOUND);
                out.writeUTF(document.rootName() == null ? "" : document.rootName());
                writeCompound(out, document.root());
            }
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    // ── reading ───────────────────────────────────────────────────────────────

    private static NbtCompound readCompound(DataInputStream in) throws IOException {
        NbtCompound compound = new NbtCompound();
        while (true) {
            int type = in.readUnsignedByte();
            if (type == TAG_END) return compound;
            String name = in.readUTF();
            compound.put(name, readPayload(in, type));
        }
    }

    private static Object readPayload(DataInputStream in, int type) throws IOException {
        return switch (type) {
            case TAG_BYTE -> in.readByte();
            case TAG_SHORT -> in.readShort();
            case TAG_INT -> in.readInt();
            case TAG_LONG -> in.readLong();
            case TAG_FLOAT -> in.readFloat();
            case TAG_DOUBLE -> in.readDouble();
            case TAG_BYTE_ARRAY -> {
                byte[] bytes = new byte[checkedLength(in.readInt())];
                in.readFully(bytes);
                yield bytes;
            }
            case TAG_STRING -> in.readUTF();
            case TAG_LIST -> {
                int elementType = in.readUnsignedByte();
                int length = checkedLength(in.readInt());
                NbtList list = new NbtList(elementType);
                for (int i = 0; i < length; i++) {
                    list.add(readPayload(in, elementType));
                }
                yield list;
            }
            case TAG_COMPOUND -> readCompound(in);
            case TAG_INT_ARRAY -> {
                int[] values = new int[checkedLength(in.readInt())];
                for (int i = 0; i < values.length; i++) values[i] = in.readInt();
                yield values;
            }
            case TAG_LONG_ARRAY -> {
                long[] values = new long[checkedLength(in.readInt())];
                for (int i = 0; i < values.length; i++) values[i] = in.readLong();
                yield values;
            }
            default -> throw new IOException("Unsupported NBT tag type: " + type);
        };
    }

    private static int checkedLength(int length) throws IOException {
        if (length < 0 || length > MAX_ARRAY_LENGTH) {
            throw new IOException("Implausible NBT array length: " + length);
        }
        return length;
    }

    // ── writing ───────────────────────────────────────────────────────────────

    private static void writeCompound(DataOutputStream out, NbtCompound compound) throws IOException {
        for (var entry : compound.values().entrySet()) {
            Object value = entry.getValue();
            int type = typeOf(value);
            out.writeByte(type);
            out.writeUTF(entry.getKey());
            writePayload(out, type, value);
        }
        out.writeByte(TAG_END);
    }

    private static void writePayload(DataOutputStream out, int type, Object value) throws IOException {
        switch (type) {
            case TAG_BYTE -> out.writeByte(((Number) value).byteValue());
            case TAG_SHORT -> out.writeShort(((Number) value).shortValue());
            case TAG_INT -> out.writeInt(((Number) value).intValue());
            case TAG_LONG -> out.writeLong(((Number) value).longValue());
            case TAG_FLOAT -> out.writeFloat(((Number) value).floatValue());
            case TAG_DOUBLE -> out.writeDouble(((Number) value).doubleValue());
            case TAG_BYTE_ARRAY -> {
                byte[] bytes = (byte[]) value;
                out.writeInt(bytes.length);
                out.write(bytes);
            }
            case TAG_STRING -> out.writeUTF((String) value);
            case TAG_LIST -> {
                NbtList list = (NbtList) value;
                // An emptied list keeps its declared type, which is what the game expects to read.
                int elementType = list.values().isEmpty()
                        ? (list.elementType() == TAG_END ? TAG_END : list.elementType())
                        : typeOf(list.values().getFirst());
                out.writeByte(elementType);
                out.writeInt(list.size());
                for (Object element : list.values()) {
                    writePayload(out, elementType, element);
                }
            }
            case TAG_COMPOUND -> writeCompound(out, (NbtCompound) value);
            case TAG_INT_ARRAY -> {
                int[] values = (int[]) value;
                out.writeInt(values.length);
                for (int element : values) out.writeInt(element);
            }
            case TAG_LONG_ARRAY -> {
                long[] values = (long[]) value;
                out.writeInt(values.length);
                for (long element : values) out.writeLong(element);
            }
            default -> throw new IOException("Cannot write NBT tag type: " + type);
        }
    }

    private static int typeOf(Object value) throws IOException {
        if (value instanceof Byte) return TAG_BYTE;
        if (value instanceof Short) return TAG_SHORT;
        if (value instanceof Integer) return TAG_INT;
        if (value instanceof Long) return TAG_LONG;
        if (value instanceof Float) return TAG_FLOAT;
        if (value instanceof Double) return TAG_DOUBLE;
        if (value instanceof byte[]) return TAG_BYTE_ARRAY;
        if (value instanceof String) return TAG_STRING;
        if (value instanceof NbtList) return TAG_LIST;
        if (value instanceof NbtCompound) return TAG_COMPOUND;
        if (value instanceof int[]) return TAG_INT_ARRAY;
        if (value instanceof long[]) return TAG_LONG_ARRAY;
        throw new IOException("Unsupported NBT value: " + (value == null ? "null" : value.getClass()));
    }
}

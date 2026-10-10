package app.voltlauncher.core.nbt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.GZIPOutputStream;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class NbtTest {

    @Test
    @DisplayName("every supported tag type survives a write/read round trip")
    void roundTripsAllTagTypes(@TempDir Path directory) throws Exception {
        NbtCompound nested = new NbtCompound().put("inner", "value");
        NbtList list = new NbtList(Nbt.TAG_COMPOUND);
        list.add(new NbtCompound().put("name", "one"));
        list.add(new NbtCompound().put("name", "two"));

        NbtCompound root = new NbtCompound()
                .put("aByte", (byte) 7)
                .put("aShort", (short) 300)
                .put("anInt", 70_000)
                .put("aLong", 9_000_000_000L)
                .put("aFloat", 1.5f)
                .put("aDouble", 2.25d)
                .put("aString", "hello")
                .put("bytes", new byte[] {1, 2, 3})
                .put("ints", new int[] {4, 5})
                .put("longs", new long[] {6L, 7L})
                .put("compound", nested)
                .put("list", list);

        Path file = directory.resolve("test.dat");
        Nbt.write(file, new Nbt.Document("root", root, false));
        Nbt.Document read = Nbt.read(file);

        assertEquals("root", read.rootName());
        assertFalse(read.gzipped());
        NbtCompound result = read.root();
        assertEquals((byte) 7, result.get("aByte"));
        assertEquals((short) 300, result.get("aShort"));
        assertEquals(70_000, result.getInt("anInt", 0));
        assertEquals(9_000_000_000L, result.getLong("aLong", 0));
        assertEquals(1.5f, result.get("aFloat"));
        assertEquals(2.25d, result.get("aDouble"));
        assertEquals("hello", result.getString("aString", ""));
        assertArrayEquals(new byte[] {1, 2, 3}, (byte[]) result.get("bytes"));
        assertArrayEquals(new int[] {4, 5}, (int[]) result.get("ints"));
        assertArrayEquals(new long[] {6L, 7L}, (long[]) result.get("longs"));
        assertEquals("value", result.getCompound("compound").getString("inner", ""));
        assertEquals(2, result.getCompoundList("list").size());
        assertEquals("two", result.getCompoundList("list").get(1).getString("name", ""));
    }

    @Test
    @DisplayName("gzip compression is detected from the file, not from its name")
    void detectsCompression(@TempDir Path directory) throws Exception {
        Path file = directory.resolve("level.dat");
        NbtCompound root = new NbtCompound().put("Data",
                new NbtCompound().put("LevelName", "Survival").put("LastPlayed", 1234L));
        Nbt.write(file, new Nbt.Document("", root, true));

        // The bytes really are gzipped, and reading picks that up without being told.
        byte[] raw = Files.readAllBytes(file);
        assertEquals(0x1F, raw[0] & 0xFF);
        assertEquals(0x8B, raw[1] & 0xFF);

        Nbt.Document read = Nbt.read(file);
        assertTrue(read.gzipped());
        assertEquals("Survival", read.root().getCompound("Data").getString("LevelName", ""));
    }

    @Test
    @DisplayName("an empty list keeps the element type it declared")
    void preservesEmptyListType(@TempDir Path directory) throws Exception {
        NbtCompound root = new NbtCompound().put("servers", new NbtList(Nbt.TAG_COMPOUND));
        Path file = directory.resolve("servers.dat");
        Nbt.write(file, new Nbt.Document("", root, false));

        NbtList list = Nbt.read(file).root().getList("servers");
        assertNotNull(list);
        assertEquals(0, list.size());
        assertEquals(Nbt.TAG_COMPOUND, list.elementType());
    }

    @Test
    @DisplayName("a truncated file is reported as such rather than parsed into nonsense")
    void rejectsTruncatedFile(@TempDir Path directory) throws Exception {
        Path file = directory.resolve("broken.dat");
        try (DataOutputStream out = new DataOutputStream(Files.newOutputStream(file))) {
            out.writeByte(Nbt.TAG_COMPOUND);
            out.writeUTF("root");
            out.writeByte(Nbt.TAG_STRING);
            out.writeUTF("name");
            // The string payload is missing entirely.
        }
        assertThrows(IOException.class, () -> Nbt.read(file));
    }

    @Test
    @DisplayName("a file that is not NBT at all is refused")
    void rejectsNonNbt(@TempDir Path directory) throws Exception {
        Path file = directory.resolve("notes.txt");
        Files.writeString(file, "just some text");
        assertThrows(IOException.class, () -> Nbt.read(file));
    }

    @Test
    @DisplayName("typed getters fall back instead of throwing on the wrong type")
    void typedGettersFallBack() {
        NbtCompound compound = new NbtCompound().put("number", 5).put("text", "five");

        assertEquals("fallback", compound.getString("number", "fallback"));
        assertEquals(9L, compound.getLong("text", 9L));
        assertEquals(3, compound.getInt("missing", 3));
        assertTrue(compound.getBoolean("missing", true));
        assertNull(compound.getCompound("text"));
        assertNull(compound.getList("text"));
        assertTrue(compound.getCompoundList("missing").isEmpty());
    }

    @Test
    @DisplayName("a gzip stream that is not NBT inside is still reported as an IO failure")
    void rejectsGzippedGarbage(@TempDir Path directory) throws Exception {
        Path file = directory.resolve("weird.dat");
        try (GZIPOutputStream out = new GZIPOutputStream(Files.newOutputStream(file))) {
            out.write("hello".getBytes());
        }
        assertThrows(IOException.class, () -> Nbt.read(file));
    }
}

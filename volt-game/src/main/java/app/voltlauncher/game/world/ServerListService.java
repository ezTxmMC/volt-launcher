package app.voltlauncher.game.world;

import app.voltlauncher.core.nbt.Nbt;
import app.voltlauncher.core.nbt.NbtCompound;
import app.voltlauncher.core.nbt.NbtList;
import app.voltlauncher.game.instance.InstanceManager;
import org.json.JSONObject;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/**
 * The in-game multiplayer list, read straight out of {@code servers.dat}.
 *
 * <p>Surfacing it in the launcher is what makes "launch straight onto this server" possible
 * without the user retyping an address they already saved. Unlike {@code level.dat} this file is
 * uncompressed NBT, which {@link Nbt} detects from the file itself.
 */
public final class ServerListService {

    private static final String SERVERS_DAT = "servers.dat";
    private static final int MAX_SERVERS = 512;

    private final InstanceManager instanceManager;

    public ServerListService(InstanceManager instanceManager) {
        this.instanceManager = instanceManager;
    }

    /**
     * @param index    position in the file, which is how the game identifies an entry
     * @param iconPng  base64 PNG the server sent, empty when it has never been pinged
     */
    public record ServerEntry(int index, String name, String address, String iconPng, boolean acceptTextures) {

        public JSONObject toJson() {
            return new JSONObject()
                    .put("index", index)
                    .put("name", name == null ? "" : name)
                    .put("address", address == null ? "" : address)
                    .put("icon", iconPng == null ? "" : iconPng)
                    .put("acceptTextures", acceptTextures);
        }
    }

    public List<ServerEntry> list(String instanceName) throws Exception {
        Path file = serversFile(instanceName);
        List<ServerEntry> servers = new ArrayList<>();
        if (!Files.isRegularFile(file)) return servers;

        Nbt.Document document = Nbt.read(file);
        List<NbtCompound> entries = document.root().getCompoundList("servers");
        for (int i = 0; i < entries.size(); i++) {
            NbtCompound entry = entries.get(i);
            servers.add(new ServerEntry(
                    i,
                    entry.getString("name", ""),
                    entry.getString("ip", ""),
                    entry.getString("icon", ""),
                    entry.getBoolean("acceptTextures", false)));
        }
        return servers;
    }

    /** Appends a server, creating {@code servers.dat} when the profile has never had one. */
    public ServerEntry add(String instanceName, String name, String address) throws Exception {
        String serverName = name == null ? "" : name.trim();
        String serverAddress = address == null ? "" : address.trim();
        if (serverAddress.isEmpty()) throw new IllegalArgumentException("A server address is required");
        if (serverName.isEmpty()) serverName = serverAddress;

        Path file = serversFile(instanceName);
        Nbt.Document document = readOrCreate(file);
        NbtList list = requireServerList(document.root());
        if (list.size() >= MAX_SERVERS) {
            throw new IllegalStateException("The server list is full");
        }

        NbtCompound entry = new NbtCompound()
                .put("name", serverName)
                .put("ip", serverAddress)
                .put("acceptTextures", (byte) 0);
        list.add(entry);
        Nbt.write(file, document);
        return new ServerEntry(list.size() - 1, serverName, serverAddress, "", false);
    }

    public void remove(String instanceName, int index) throws Exception {
        Path file = serversFile(instanceName);
        if (!Files.isRegularFile(file)) throw new IllegalStateException("This profile has no server list");

        Nbt.Document document = Nbt.read(file);
        NbtList list = requireServerList(document.root());
        if (index < 0 || index >= list.size()) {
            throw new IllegalArgumentException("No server at position " + index);
        }
        list.values().remove(index);
        Nbt.write(file, document);
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private Path serversFile(String instanceName) throws Exception {
        return instanceManager.findByName(instanceName).gameDirectory().resolve(SERVERS_DAT);
    }

    private Nbt.Document readOrCreate(Path file) throws Exception {
        if (Files.isRegularFile(file)) return Nbt.read(file);
        NbtCompound root = new NbtCompound();
        root.put("servers", new NbtList(Nbt.TAG_COMPOUND));
        // servers.dat is stored uncompressed, unlike every other .dat the game writes.
        return new Nbt.Document("", root, false);
    }

    private NbtList requireServerList(NbtCompound root) {
        NbtList list = root.getList("servers");
        if (list == null) {
            list = new NbtList(Nbt.TAG_COMPOUND);
            root.put("servers", list);
        }
        return list;
    }

    /** Decodes a server's base64 icon, or {@code null} when it has none or it is malformed. */
    public static byte[] decodeIcon(String base64) {
        if (base64 == null || base64.isBlank()) return null;
        try {
            String payload = base64.contains(",") ? base64.substring(base64.indexOf(',') + 1) : base64;
            return Base64.getDecoder().decode(payload.replaceAll("\\s", ""));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}

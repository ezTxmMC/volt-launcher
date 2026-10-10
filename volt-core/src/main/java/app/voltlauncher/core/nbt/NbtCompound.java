package app.voltlauncher.core.nbt;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A named binary tag compound, backed by a plain map so callers can read it without knowing the
 * tag machinery. Values are stored as the closest Java type: {@code Byte}, {@code Short},
 * {@code Integer}, {@code Long}, {@code Float}, {@code Double}, {@code String}, {@code byte[]},
 * {@code int[]}, {@code long[]}, {@link NbtList} or another {@code NbtCompound}.
 */
public final class NbtCompound {

    private final Map<String, Object> values = new LinkedHashMap<>();

    public Map<String, Object> values() {
        return values;
    }

    public NbtCompound put(String name, Object value) {
        values.put(name, value);
        return this;
    }

    public boolean has(String name) {
        return values.containsKey(name);
    }

    public Object get(String name) {
        return values.get(name);
    }

    public String getString(String name, String fallback) {
        Object value = values.get(name);
        return value instanceof String text ? text : fallback;
    }

    public long getLong(String name, long fallback) {
        Object value = values.get(name);
        return value instanceof Number number ? number.longValue() : fallback;
    }

    public int getInt(String name, int fallback) {
        Object value = values.get(name);
        return value instanceof Number number ? number.intValue() : fallback;
    }

    public boolean getBoolean(String name, boolean fallback) {
        Object value = values.get(name);
        return value instanceof Number number ? number.byteValue() != 0 : fallback;
    }

    public NbtCompound getCompound(String name) {
        Object value = values.get(name);
        return value instanceof NbtCompound compound ? compound : null;
    }

    public NbtList getList(String name) {
        Object value = values.get(name);
        return value instanceof NbtList list ? list : null;
    }

    /** The compounds inside a list tag, or an empty list when the tag is missing or another type. */
    public List<NbtCompound> getCompoundList(String name) {
        NbtList list = getList(name);
        if (list == null) return List.of();
        List<NbtCompound> result = new ArrayList<>();
        for (Object entry : list.values()) {
            if (entry instanceof NbtCompound compound) result.add(compound);
        }
        return result;
    }

    @Override
    public String toString() {
        return "NbtCompound" + values.keySet();
    }
}

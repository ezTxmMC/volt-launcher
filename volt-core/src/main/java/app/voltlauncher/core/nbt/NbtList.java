package app.voltlauncher.core.nbt;

import java.util.ArrayList;
import java.util.List;

/**
 * A list tag. The element type is carried explicitly because an empty NBT list still declares
 * one, and writing the list back has to reproduce it exactly.
 */
public final class NbtList {

    private final List<Object> values = new ArrayList<>();
    private int elementType;

    public NbtList(int elementType) {
        this.elementType = elementType;
    }

    public int elementType() {
        return elementType;
    }

    public void setElementType(int type) {
        this.elementType = type;
    }

    public List<Object> values() {
        return values;
    }

    public NbtList add(Object value) {
        values.add(value);
        return this;
    }

    public int size() {
        return values.size();
    }
}

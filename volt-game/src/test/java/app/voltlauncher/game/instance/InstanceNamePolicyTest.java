package app.voltlauncher.game.instance;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InstanceNamePolicyTest {

    private static Instance withSlug(String slug) {
        return Instance.create(slug, slug, "1.21.1", "release", 0L, 21, "java-runtime");
    }

    @Test
    @DisplayName("surrounding and repeated whitespace is collapsed")
    void normalisesWhitespace() {
        assertEquals("My Profile", InstanceNamePolicy.normalize("  My    Profile  "));
        assertEquals("", InstanceNamePolicy.normalize(null));
        assertEquals("", InstanceNamePolicy.normalize("   "));
    }

    @Test
    @DisplayName("an empty or over-long name is refused")
    void rejectsUnusableLengths() {
        assertThrows(IllegalArgumentException.class, () -> InstanceNamePolicy.validate(""));
        assertThrows(IllegalArgumentException.class, () -> InstanceNamePolicy.validate("   "));
        assertThrows(IllegalArgumentException.class, () -> InstanceNamePolicy.validate("x".repeat(65)));
        InstanceNamePolicy.validate("x".repeat(64));
    }

    @Test
    @DisplayName("characters that would break a path are refused")
    void rejectsPathCharacters() {
        List<String> unusable = List.of("a/b", "a\\b", "a:b", "a*b", "a?b", "a\"b", "a<b", "a>b", "a|b");
        for (String name : unusable) {
            assertThrows(IllegalArgumentException.class, () -> InstanceNamePolicy.validate(name),
                    "should have refused: " + name);
        }
    }

    @Test
    @DisplayName("ordinary names with punctuation are accepted")
    void acceptsNormalNames() {
        InstanceNamePolicy.validate("All the Mods 9");
        InstanceNamePolicy.validate("Survival (1.21.1)");
        InstanceNamePolicy.validate("Gruene Welt - 2024");
    }

    @Test
    @DisplayName("a slug is lowercase, ASCII and free of separators")
    void slugifiesNames() {
        assertEquals("all-the-mods-9", InstanceNamePolicy.uniqueSlug("All the Mods 9", List.of()));
        assertEquals("survival-1-21-1", InstanceNamePolicy.uniqueSlug("Survival (1.21.1)", List.of()));
    }

    @Test
    @DisplayName("accents are folded away rather than dropped from the slug")
    void foldsAccents() {
        assertEquals("grune-welt", InstanceNamePolicy.uniqueSlug("Grüne Welt", List.of()));
    }

    @Test
    @DisplayName("a name with no usable characters still gets a slug")
    void fallsBackForUnslugifiableNames() {
        assertEquals("instance", InstanceNamePolicy.uniqueSlug("!!! ???", List.of()));
    }

    @Test
    @DisplayName("a taken slug gets a numeric suffix rather than colliding")
    void deduplicatesSlugs() {
        List<Instance> existing = List.of(withSlug("survival"), withSlug("survival-2"));
        String slug = InstanceNamePolicy.uniqueSlug("Survival", existing);

        assertEquals("survival-3", slug);
        assertNotEquals("survival", slug);
    }

    @Test
    @DisplayName("slug collisions are checked case-insensitively")
    void deduplicatesIgnoringCase() {
        List<Instance> existing = List.of(withSlug("SURVIVAL"));
        assertTrue(InstanceNamePolicy.uniqueSlug("Survival", existing).startsWith("survival-"));
    }
}

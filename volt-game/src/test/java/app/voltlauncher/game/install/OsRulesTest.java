package app.voltlauncher.game.install;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OsRulesTest {

    private static JSONArray rules(JSONObject... entries) {
        JSONArray array = new JSONArray();
        for (JSONObject entry : entries) array.put(entry);
        return array;
    }

    private static JSONObject allowForOs(String name) {
        return new JSONObject().put("action", "allow").put("os", new JSONObject().put("name", name));
    }

    @Test
    @DisplayName("no rules means allowed")
    void emptyRulesAllow() {
        assertTrue(OsRules.isAllowedByRules(null));
        assertTrue(OsRules.isAllowedByRules(new JSONArray()));
    }

    @Test
    @DisplayName("a rule for another operating system does not apply")
    void rejectsOtherOs() {
        String other = OsRules.current().name().equals("windows") ? "osx" : "windows";
        assertFalse(OsRules.isAllowedByRules(rules(allowForOs(other))));
        assertTrue(OsRules.isAllowedByRules(rules(allowForOs(OsRules.current().name()))));
    }

    @Test
    @DisplayName("the last matching rule wins, so a disallow after an allow denies")
    void lastMatchingRuleWins() {
        JSONArray both = rules(
                new JSONObject().put("action", "allow"),
                new JSONObject().put("action", "disallow").put("os",
                        new JSONObject().put("name", OsRules.current().name())));

        assertFalse(OsRules.isAllowedByRules(both));
    }

    @Test
    @DisplayName("a feature-gated rule needs that feature to be active")
    void honoursFeatures() {
        JSONArray featureRule = rules(new JSONObject()
                .put("action", "allow")
                .put("features", new JSONObject().put("has_custom_resolution", true)));

        assertFalse(OsRules.isAllowedByRules(featureRule));
        assertFalse(OsRules.isAllowedByRules(featureRule, Map.of("has_custom_resolution", false)));
        assertTrue(OsRules.isAllowedByRules(featureRule, Map.of("has_custom_resolution", true)));
    }

    @Test
    @DisplayName("a rule requiring a feature to be off matches when it is off")
    void honoursNegativeFeatures() {
        JSONArray rule = rules(new JSONObject()
                .put("action", "allow")
                .put("features", new JSONObject().put("is_demo_user", false)));

        assertTrue(OsRules.isAllowedByRules(rule, Map.of()));
        assertFalse(OsRules.isAllowedByRules(rule, Map.of("is_demo_user", true)));
    }

    @Test
    @DisplayName("an architecture that does not match rules the library out")
    void honoursArchitecture() {
        String otherArch = System.getProperty("os.arch", "").contains("64") ? "x86" : "x86_64";
        JSONArray rule = rules(new JSONObject()
                .put("action", "allow")
                .put("os", new JSONObject().put("name", OsRules.current().name()).put("arch", otherArch)));

        assertFalse(OsRules.isAllowedByRules(rule));
    }

    @Test
    @DisplayName("the current platform reports a usable name and bit width")
    void reportsCurrentOs() {
        OsRules.OsDetails current = OsRules.current();
        assertTrue(current.name().equals("windows") || current.name().equals("osx")
                || current.name().equals("linux"));
        assertTrue(current.archBits().equals("64") || current.archBits().equals("32"));
    }

    @Test
    @DisplayName("a native classifier resolves for the current platform and expands the arch token")
    void resolvesNativeClassifier() {
        OsRules.OsDetails current = OsRules.current();
        JSONObject natives = new JSONObject()
                .put(current.name(), "natives-" + current.name() + "-${arch}");

        String classifier = OsRules.resolveNativeClassifier(natives);
        assertNotNull(classifier);
        assertEquals("natives-" + current.name() + "-" + current.archBits(), classifier);
        assertNull(OsRules.resolveNativeClassifier(new JSONObject()));
    }
}

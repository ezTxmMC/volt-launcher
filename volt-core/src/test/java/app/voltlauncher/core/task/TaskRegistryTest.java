package app.voltlauncher.core.task;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TaskRegistryTest {

    @Test
    @DisplayName("a task runs, progresses and finishes")
    void tracksLifecycle() {
        TaskRegistry registry = new TaskRegistry();
        String id = registry.begin("backup", "Backing up Survival", "Survival");

        TaskRegistry.Task started = registry.get(id);
        assertNotNull(started);
        assertEquals(TaskRegistry.State.RUNNING, started.state());
        assertEquals(-1, started.percent());
        assertFalse(started.isFinished());

        registry.progress(id, "archiving", 25, 100);
        assertEquals(25, registry.get(id).percent());
        assertEquals("archiving", registry.get(id).stage());

        registry.succeed(id, "done");
        assertEquals(TaskRegistry.State.DONE, registry.get(id).state());
        assertTrue(registry.get(id).isFinished());
        assertTrue(registry.get(id).finishedAt() > 0);
        assertTrue(registry.running().isEmpty());
    }

    @Test
    @DisplayName("percent is -1 while the work cannot be counted, and clamped otherwise")
    void computesPercent() {
        TaskRegistry registry = new TaskRegistry();
        String id = registry.begin("install", "Installing", "");

        registry.progress(id, "x", 5, 0);
        assertEquals(-1, registry.get(id).percent());

        registry.progress(id, "x", 500, 100);
        assertEquals(100, registry.get(id).percent());

        registry.progress(id, "x", -20, 100);
        assertEquals(0, registry.get(id).percent());
    }

    @Test
    @DisplayName("only a cancellable task can be cancelled")
    void guardsCancellation() {
        TaskRegistry registry = new TaskRegistry();
        String plain = registry.begin("verify", "Verifying", "");
        assertThrows(IllegalStateException.class, () -> registry.requestCancel(plain));

        String cancellable = registry.begin("backup", "Backing up", "", true);
        assertTrue(registry.requestCancel(cancellable));
        assertTrue(registry.isCancelRequested(cancellable));
        assertThrows(TaskRegistry.CancelledException.class, () -> registry.checkCancelled(cancellable));

        registry.markCancelled(cancellable, "stopped");
        assertEquals(TaskRegistry.State.CANCELLED, registry.get(cancellable).state());
        assertFalse(registry.isCancelRequested(cancellable));
    }

    @Test
    @DisplayName("cancelling a finished task does nothing")
    void ignoresCancelAfterFinish() {
        TaskRegistry registry = new TaskRegistry();
        String id = registry.begin("backup", "Backing up", "", true);
        registry.succeed(id, "done");

        assertFalse(registry.requestCancel(id));
    }

    @Test
    @DisplayName("tasks are listed newest first and finished ones can be swept")
    void listsAndClears() {
        TaskRegistry registry = new TaskRegistry();
        String first = registry.begin("a", "First", "");
        String second = registry.begin("b", "Second", "");
        registry.fail(first, "boom");

        assertEquals(2, registry.list().size());
        assertEquals(1, registry.running().size());
        assertEquals(second, registry.running().getFirst().id());

        registry.clearFinished();
        assertNull(registry.get(first));
        assertNotNull(registry.get(second));

        registry.clear(second);
        assertTrue(registry.list().isEmpty());
    }

    @Test
    @DisplayName("a failure records its message")
    void recordsFailureMessage() {
        TaskRegistry registry = new TaskRegistry();
        String id = registry.begin("repair", "Repairing", "Survival");
        registry.fail(id, "disk full");

        assertEquals(TaskRegistry.State.FAILED, registry.get(id).state());
        assertEquals("disk full", registry.get(id).message());
        assertEquals("Survival", registry.get(id).subject());
    }

    @Test
    @DisplayName("an unknown id is simply absent")
    void toleratesUnknownIds() {
        TaskRegistry registry = new TaskRegistry();
        assertNull(registry.get("nope"));
        assertNull(registry.get(null));
        assertFalse(registry.isCancelRequested(null));
        registry.progress("nope", "x", 1, 2);
        registry.succeed("nope", "x");
    }
}

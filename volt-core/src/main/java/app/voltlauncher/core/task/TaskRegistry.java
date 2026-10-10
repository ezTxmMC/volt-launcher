package app.voltlauncher.core.task;

import org.json.JSONObject;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentHashMap.KeySetView;

/**
 * One place that knows about every long-running operation in the launcher — modpack installs,
 * Java downloads, backups, repairs and content installs.
 *
 * <p>Without it each feature reported progress through its own polling endpoint, so the UI could
 * only show whatever screen the user happened to be on. Registering here is what makes a single
 * "what is the launcher doing right now" view possible, and gives every operation the same
 * cancellation handshake: the caller flips a flag, the worker notices and stops at its next
 * checkpoint rather than being killed mid-write.
 */
public final class TaskRegistry {

    public enum State { RUNNING, DONE, FAILED, CANCELLED }

    /**
     * @param kind     stable identifier of the operation type, used by the UI to pick an icon
     * @param subject  what the task acts on, typically a profile name; may be blank
     * @param stage    stable identifier of the current step, translated by the UI
     * @param total    units of work, or 0 when the work cannot be counted
     */
    public record Task(
            String id,
            String kind,
            String title,
            String subject,
            String stage,
            int completed,
            int total,
            State state,
            String message,
            long startedAt,
            long finishedAt,
            boolean cancellable) {

        public int percent() {
            if (total <= 0) return -1;
            return Math.min(100, Math.max(0, (int) Math.round((completed * 100.0) / total)));
        }

        public boolean isFinished() {
            return state != State.RUNNING;
        }

        public JSONObject toJson() {
            return new JSONObject()
                    .put("id", id)
                    .put("kind", kind)
                    .put("title", title == null ? "" : title)
                    .put("subject", subject == null ? "" : subject)
                    .put("stage", stage == null ? JSONObject.NULL : stage)
                    .put("completed", completed)
                    .put("total", total)
                    .put("percent", percent())
                    .put("state", state.name().toLowerCase(Locale.ROOT))
                    .put("message", message == null ? JSONObject.NULL : message)
                    .put("startedAt", startedAt)
                    .put("finishedAt", finishedAt)
                    .put("cancellable", cancellable);
        }
    }

    /** Raised by a worker that noticed a cancellation request; callers map it onto a cancelled task. */
    public static final class CancelledException extends RuntimeException {
        public CancelledException(String message) {
            super(message);
        }
    }

    /** How long a finished task stays in the list before it is swept away. */
    private static final long RETENTION_MS = 5 * 60 * 1000L;

    private final ConcurrentHashMap<String, Task> tasks = new ConcurrentHashMap<>();
    private final KeySetView<String, Boolean> cancelRequested = ConcurrentHashMap.newKeySet();

    public String begin(String kind, String title, String subject) {
        return begin(kind, title, subject, false);
    }

    public String begin(String kind, String title, String subject, boolean cancellable) {
        String id = UUID.randomUUID().toString();
        long now = System.currentTimeMillis();
        tasks.put(id, new Task(id, kind, title, subject, null, 0, 0,
                State.RUNNING, null, now, 0L, cancellable));
        sweep();
        return id;
    }

    public void progress(String id, String stage, int completed, int total) {
        tasks.computeIfPresent(id, (unused, current) -> new Task(
                current.id(), current.kind(), current.title(), current.subject(), stage,
                completed, total, current.state(), current.message(),
                current.startedAt(), current.finishedAt(), current.cancellable()));
    }

    public void succeed(String id, String message) {
        finish(id, State.DONE, message);
    }

    public void fail(String id, String message) {
        finish(id, State.FAILED, message);
    }

    /** Marks a task cancelled outright, for a worker that never started its real work. */
    public void markCancelled(String id, String message) {
        cancelRequested.remove(id);
        finish(id, State.CANCELLED, message);
    }

    /** Asks a running task to stop. The worker decides when it is safe to do so. */
    public boolean requestCancel(String id) {
        Task task = tasks.get(id);
        if (task == null || task.isFinished()) return false;
        if (!task.cancellable()) {
            throw new IllegalStateException("This task cannot be cancelled");
        }
        cancelRequested.add(id);
        return true;
    }

    public boolean isCancelRequested(String id) {
        return id != null && cancelRequested.contains(id);
    }

    /** Throws if cancellation was requested, so workers can guard a loop with one call. */
    public void checkCancelled(String id) {
        if (isCancelRequested(id)) {
            throw new CancelledException("Cancelled");
        }
    }

    public Task get(String id) {
        return id == null ? null : tasks.get(id);
    }

    /** Every known task, newest first. */
    public List<Task> list() {
        sweep();
        return tasks.values().stream()
                .sorted(Comparator.comparingLong(Task::startedAt).reversed())
                .toList();
    }

    public List<Task> running() {
        return list().stream().filter(task -> !task.isFinished()).toList();
    }

    public void clear(String id) {
        tasks.remove(id);
        cancelRequested.remove(id);
    }

    public void clearFinished() {
        tasks.values().removeIf(Task::isFinished);
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private void finish(String id, State state, String message) {
        cancelRequested.remove(id);
        tasks.computeIfPresent(id, (unused, current) -> new Task(
                current.id(), current.kind(), current.title(), current.subject(), current.stage(),
                current.completed(), current.total(), state, message,
                current.startedAt(), System.currentTimeMillis(), false));
    }

    /** Drops finished tasks the user has had a chance to see, so the list cannot grow forever. */
    private void sweep() {
        long cutoff = System.currentTimeMillis() - RETENTION_MS;
        tasks.values().removeIf(task -> task.isFinished() && task.finishedAt() > 0 && task.finishedAt() < cutoff);
    }
}

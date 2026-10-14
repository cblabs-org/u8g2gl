/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: src/u8g2gl_timer.cpp
 * Purpose: Implements host-owned timers (§11.1): an intrusive singly linked
 *          list threaded through storage the host declares, scheduled by due
 *          time, and a handler that survives a callback rearranging the list
 *          beneath it. LVGL's lv_timer supplied the semantics — repeat count,
 *          pause, ready, reset, a timer deleting itself — but not the
 *          implementation, which allocates and drifts.
 *
 * Description: Module state (the list head and the handler's two guards), the
 *              LVGL-named operations, the destructor that unlinks, and
 *              u8g2gl_timer_handler(), which ui_handler() calls first in every
 *              loop.
 */
#include "u8g2gl/u8g2gl_timer.h"
#include "u8g2gl/u8g2gl_core.h"
#include "u8g2gl/u8g2gl_types.h"

// Module state. The head is the only thing the library owns; every timer is
// the host's. The two guards exist only while the handler is running a
// callback, so a callback can unlink anything without leaving the handler
// holding a dangling pointer:
//   s_list_changed — set by any link or unlink; the handler restarts its walk
//                    from the head rather than following a `next_` that may
//                    belong to a timer no longer on the list (or no longer
//                    alive, if its owner was destroyed in the callback).
//   s_running      — the timer whose callback is in progress; delete clears
//                    it, which tells the handler not to touch that timer's
//                    storage again (LVGL's state.timer_deleted, per timer).
static u8g2gl_timer* s_head = nullptr;
static bool s_list_changed = false;
static u8g2gl_timer* s_running = nullptr;

// A zero period would leave a timer due on every pass, so the loop could never
// sleep; 1 ms is the shortest interval the deadline can express.
static uint32_t u8g2gl_timer_clamp_period(uint32_t period_ms) {
    return period_ms == 0 ? 1u : period_ms;
}

// ~u8g2gl_timer
// RAII: a timer that leaves scope, or whose owner is destroyed, is unlinked so
// the handler can never reach it.
u8g2gl_timer::~u8g2gl_timer() {
    u8g2gl_timer_delete(this);
}

// u8g2gl_timer_init
// Resets every field and schedules the first run one period from now; links
// the timer at the head of the list unless it is already linked.
//   timer     — host-owned storage; must stay at this address while linked
//   cb        — callback, or nullptr
//   period_ms — interval, clamped to at least 1 ms
//   user_data — opaque context for the callback
void u8g2gl_timer_init(u8g2gl_timer* timer, u8g2gl_timer_cb_t cb, uint32_t period_ms, void* user_data) {
    if (timer == nullptr) {
        return;
    }

    // --- Step 1: Reset the state and schedule the first run ---
    // First run at now + period, as lv_timer_create does.
    timer->cb_ = cb;
    timer->user_data_ = user_data;
    timer->period_ms_ = u8g2gl_timer_clamp_period(period_ms);
    timer->due_ms_ = u8g2gl_tick_now() + timer->period_ms_;
    timer->repeat_count_ = -1;
    timer->paused_ = false;

    // --- Step 2: Link it, once ---
    // Re-initialising a linked timer must not link it again: a node on the list
    // twice makes the list a cycle. Its run-this-pass mark is left alone, so a
    // timer re-initialised by its own callback cannot run a second time in the
    // same pass.
    if (timer->linked_) {
        return;
    }
    // Head insertion, as LVGL's lv_ll_ins_head: O(1), and the order only
    // decides which of two timers due at the same tick runs first.
    timer->next_ = s_head;
    timer->ran_this_pass_ = false;
    timer->linked_ = true;
    s_head = timer;
    s_list_changed = true;
}

// u8g2gl_timer_delete
// Unlinks the timer. A singly linked list needs the predecessor, found by a
// walk; the linked_ flag makes deleting an unlinked timer O(1).
//   timer — timer to unlink; nullptr or unlinked is a no-op
void u8g2gl_timer_delete(u8g2gl_timer* timer) {
    if (timer == nullptr || !timer->linked_) {
        return;
    }

    // --- Step 1: Find the link that points at this timer, and bypass it ---
    u8g2gl_timer** link = &s_head;
    while (*link != nullptr && *link != timer) {
        link = &(*link)->next_;
    }
    if (*link == timer) {
        *link = timer->next_;
    }

    // --- Step 2: Mark it unlinked, and tell a running handler ---
    timer->next_ = nullptr;
    timer->linked_ = false;
    s_list_changed = true;
    if (s_running == timer) {
        s_running = nullptr;
    }
}

void u8g2gl_timer_pause(u8g2gl_timer* timer) {
    if (timer != nullptr) {
        timer->paused_ = true;
    }
}

// u8g2gl_timer_resume
// Clears the pause and keeps the schedule. A timer can only legitimately be
// due at most one period ahead, so a due time further ahead than that means
// the kept due time has fallen more than 2^31 ms behind (a pause of ~25 days)
// and wrapped round to look like the future; it is made due now instead.
//   timer — timer to resume
void u8g2gl_timer_resume(u8g2gl_timer* timer) {
    if (timer == nullptr) {
        return;
    }
    timer->paused_ = false;
    const uint32_t now = u8g2gl_tick_now();
    if (timer->due_ms_ - now > timer->period_ms_) {
        if (static_cast<int32_t>(now - timer->due_ms_) < 0) {
            timer->due_ms_ = now;
        }
    }
}

// u8g2gl_timer_set_period
// LVGL measures the time remaining from the last run against the new period.
// The last run here is the previous due time, which is the current due time
// minus the old period — so the change keeps the run's phase and the drift-
// free rule, instead of restarting from whenever this was called.
//   timer     — timer to change
//   period_ms — new interval, clamped to at least 1 ms
void u8g2gl_timer_set_period(u8g2gl_timer* timer, uint32_t period_ms) {
    if (timer == nullptr) {
        return;
    }
    const uint32_t last_run_ms = timer->due_ms_ - timer->period_ms_;
    timer->period_ms_ = u8g2gl_timer_clamp_period(period_ms);
    timer->due_ms_ = last_run_ms + timer->period_ms_;
}

// u8g2gl_timer_ready
// Due one whole period ago, as LVGL's last_run = now - period - 1. Being a full
// period late is what makes the handler run it once and resync to now +
// period, rather than schedule its next run from a due time in the past.
//   timer — timer to make due
void u8g2gl_timer_ready(u8g2gl_timer* timer) {
    if (timer != nullptr) {
        timer->due_ms_ = u8g2gl_tick_now() - timer->period_ms_;
    }
}

void u8g2gl_timer_reset(u8g2gl_timer* timer) {
    if (timer != nullptr) {
        timer->due_ms_ = u8g2gl_tick_now() + timer->period_ms_;
    }
}

// u8g2gl_timer_set_repeat_count
// 0 pauses at once: with no heap there is nothing to auto-delete, and a timer
// with no runs left should not wait for its due time to be found exhausted.
//   timer        — timer to change
//   repeat_count — runs left, or -1 for forever
void u8g2gl_timer_set_repeat_count(u8g2gl_timer* timer, int32_t repeat_count) {
    if (timer == nullptr) {
        return;
    }
    timer->repeat_count_ = repeat_count;
    if (repeat_count == 0) {
        timer->paused_ = true;
    }
}

void* u8g2gl_timer_get_user_data(const u8g2gl_timer* timer) {
    return timer != nullptr ? timer->user_data_ : nullptr;
}

// u8g2gl_timer_handler
// One pass: every due, unpaused timer runs once, then the earliest due time is
// converted to a delay. Callbacks may link, unlink or destroy timers, so the
// walk restarts from the head whenever the list changed, and the per-timer
// ran_this_pass_ mark is what stops a restart running anything twice.
//   now — the tick ui_handler() read for this loop
uint32_t u8g2gl_timer_handler(uint32_t now) {
    // --- Step 1: Clear every timer's run-this-pass mark ---
    for (u8g2gl_timer* t = s_head; t != nullptr; t = t->next_) {
        t->ran_this_pass_ = false;
    }

    // --- Step 2: Run each due timer once ---
    u8g2gl_timer* t = s_head;
    while (t != nullptr) {
        // Difference arithmetic: the tick wraps every 49.7 days, and a plain
        // `>=` on absolute values would misjudge a due time past the wrap.
        const bool due = static_cast<int32_t>(now - t->due_ms_) >= 0;
        if (t->ran_this_pass_ || t->paused_ || !due) {
            t = t->next_;
            continue;
        }
        t->ran_this_pass_ = true;

        // Schedule from the due time, not from now, so a late wake does not
        // push every later run back (LVGL's last_run = lv_tick_get() does, and
        // a 1 s timer then runs slow). A whole period or more late — a stalled
        // loop — runs once and resyncs, rather than running repeatedly to
        // catch up. Done before the callback so the callback's own reset(),
        // ready() or set_period() has the last word.
        const uint32_t late_ms = now - t->due_ms_;
        if (late_ms >= t->period_ms_) {
            t->due_ms_ = now + t->period_ms_;
        } else {
            t->due_ms_ += t->period_ms_;
        }
        if (t->repeat_count_ > 0) {
            --t->repeat_count_;
        }

        s_list_changed = false;
        s_running = t;
        if (t->cb_ != nullptr) {
            t->cb_(t);
        }
        // s_running still pointing at t proves the callback neither deleted nor
        // destroyed it, so its storage may be touched again.
        const bool still_linked = (s_running == t);
        s_running = nullptr;

        // Pausing after the callback, as LVGL does, lets a callback that sets a
        // new repeat count on its last run keep the timer going.
        if (still_linked && t->repeat_count_ == 0) {
            t->paused_ = true;
        }

        t = s_list_changed ? s_head : t->next_;
    }

    // --- Step 3: Report the time until the earliest unpaused timer ---
    uint32_t earliest = U8G2GL_IDLE;
    for (const u8g2gl_timer* p = s_head; p != nullptr; p = p->next_) {
        if (p->paused_) {
            continue;
        }
        const int32_t remaining = static_cast<int32_t>(p->due_ms_ - now);
        // Every timer that ran is due at least 1 ms ahead, so only one made due
        // during this pass (ready() from a callback) can land here.
        if (remaining <= 0) {
            return 0;
        }
        earliest = u8g2gl_min(earliest, static_cast<uint32_t>(remaining));
    }
    return earliest;
}

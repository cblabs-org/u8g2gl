/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_timer.h
 * Purpose: Periodic callbacks run by ui_handler(), so that data which changes
 *          with time — the wall-clock time above all — is refreshed by the
 *          library rather than by the application's loop. The idiom is LVGL's:
 *          a timer whose callback writes a subject, which every bound widget
 *          then observes (§11.1). The API is lv_timer's, reshaped for storage
 *          the host owns.
 *
 *          Two deliberate departures from LVGL. Storage: LVGL allocates each
 *          timer on the heap and keeps them in a linked list it owns; here the
 *          host declares each u8g2gl_timer (a static, or a member of its own
 *          object) and the library links them intrusively, so there is no pool,
 *          no capacity setting and no allocation ([D-1]). Scheduling: LVGL
 *          reschedules from the moment a callback ran, so every late wake pushes
 *          all later runs back; here the next run is due one period after the
 *          previous DUE time, which keeps a 1 s timer at exactly one run per
 *          second over any length of time.
 *
 *          Widgets do not use timers. They keep their own tick() deadlines,
 *          which ui_handler() combines with the timer deadline.
 *
 * Description: The u8g2gl_timer type, its callback type, the LVGL-named
 *              operations on caller-owned storage, and the handler ui_handler()
 *              calls once per loop.
 *
 *              Thread safety: none, as in LVGL built without LV_USE_OS. Every
 *              function here, and every timer callback, must run on the thread
 *              that calls ui_handler(). A timer may not be touched from an
 *              interrupt or another task.
 *
 * Exported Types:
 * - u8g2gl_timer_cb_t: Timer callback, void (*)(u8g2gl_timer*)
 * - u8g2gl_timer:      Host-owned timer storage; unlinks itself on destruction
 *
 * Exported Functions:
 *
 *     Lifecycle (lv_timer_create / lv_timer_delete):
 *     - u8g2gl_timer_init():              Link and schedule the first run at now + period
 *     - u8g2gl_timer_delete():            Unlink; safe to call twice
 *
 *     Control:
 *     - u8g2gl_timer_pause():             Stop running; the schedule is kept
 *     - u8g2gl_timer_resume():            Run again from the kept schedule
 *     - u8g2gl_timer_set_period():        New period, measured from the last run
 *     - u8g2gl_timer_ready():             Due now
 *     - u8g2gl_timer_reset():             Due one period from now
 *     - u8g2gl_timer_set_repeat_count():  Runs left; -1 is forever, 0 pauses
 *
 *     Query:
 *     - u8g2gl_timer_get_user_data():     The pointer passed to init
 *
 *     Handler (called by ui_handler()):
 *     - u8g2gl_timer_handler():           Run every due timer once; return the next deadline
 */
#ifndef U8G2GL_TIMER_H
#define U8G2GL_TIMER_H

#include <cstdint>

class u8g2gl_timer;

/**
 * @brief Timer callback. Receives the timer that fired, as in LVGL; fetch the
 *        context with u8g2gl_timer_get_user_data().
 *
 * A callback may call any function in this header, on its own timer or any
 * other: delete itself, initialise a new timer, re-initialise one, make one
 * ready. The handler is written to survive all of these.
 */
using u8g2gl_timer_cb_t = void (*)(u8g2gl_timer* timer);

/**
 * @brief Storage for one timer, declared by the host.
 *
 * Declare it as a static or as a member of the object that owns the callback's
 * context; then call u8g2gl_timer_init(). The library holds only a pointer to
 * the first linked timer and threads the rest through each timer's own `next_`
 * field, so the number of timers is whatever the host declares.
 *
 * A default-constructed timer is unlinked and does nothing. Destroying a linked
 * timer unlinks it, so a timer that leaves scope, or whose owning object is
 * destroyed, can never be run through a dangling pointer.
 *
 * Non-copyable and non-movable: the list points at this exact storage.
 *
 * @code
 * static u8g2gl_timer s_battery_timer;
 *
 * static void on_battery_timer(u8g2gl_timer* t) {
 *     auto* level = static_cast<u8g2gl_subject_int*>(u8g2gl_timer_get_user_data(t));
 *     level->set(read_battery_percent());
 * }
 *
 * void setup() {
 *     u8g2gl_timer_init(&s_battery_timer, on_battery_timer, 5000, &ui_subject_battery);
 * }
 * @endcode
 */
class u8g2gl_timer {
public:
    u8g2gl_timer() = default;

    /** @brief Unlink the timer if it is linked (RAII). */
    ~u8g2gl_timer();

    u8g2gl_timer(const u8g2gl_timer&) = delete;
    u8g2gl_timer& operator=(const u8g2gl_timer&) = delete;
    u8g2gl_timer(u8g2gl_timer&&) = delete;
    u8g2gl_timer& operator=(u8g2gl_timer&&) = delete;

private:
    // The API is free functions, as LVGL's is, so they are the friends that may
    // touch the state; nothing else can.
    friend void u8g2gl_timer_init(u8g2gl_timer*, u8g2gl_timer_cb_t, uint32_t, void*);
    friend void u8g2gl_timer_delete(u8g2gl_timer*);
    friend void u8g2gl_timer_pause(u8g2gl_timer*);
    friend void u8g2gl_timer_resume(u8g2gl_timer*);
    friend void u8g2gl_timer_set_period(u8g2gl_timer*, uint32_t);
    friend void u8g2gl_timer_ready(u8g2gl_timer*);
    friend void u8g2gl_timer_reset(u8g2gl_timer*);
    friend void u8g2gl_timer_set_repeat_count(u8g2gl_timer*, int32_t);
    friend void* u8g2gl_timer_get_user_data(const u8g2gl_timer*);
    friend uint32_t u8g2gl_timer_handler(uint32_t);

    // Members ordered largest-alignment-first: pointers, then 32-bit, then bytes.
    u8g2gl_timer* next_ = nullptr;      ///< Intrusive link to the next timer in the list
    u8g2gl_timer_cb_t cb_ = nullptr;    ///< Callback; nullptr runs nothing but keeps the schedule
    void* user_data_ = nullptr;         ///< Returned by u8g2gl_timer_get_user_data()
    uint32_t period_ms_ = 0;            ///< Interval between runs, at least 1 ms
    uint32_t due_ms_ = 0;               ///< When the next run is due, on the tick clock
    int32_t repeat_count_ = -1;         ///< Runs left; -1 forever
    bool linked_ = false;               ///< On the list; makes delete O(1) when it is not
    bool paused_ = false;               ///< Skipped by the handler; the schedule is kept
    bool ran_this_pass_ = false;        ///< Handler bookkeeping: run at most once per pass
};

// --- Lifecycle ---
//
// u8g2gl_timer_init, _resume, _set_period, _ready and _reset each give a timer
// work, so each fires the resume callback (u8g2gl_set_resume_cb()) as
// lv_timer_handler_resume() is fired by the matching LVGL calls — except inside
// ui_handler(), where the loop is awake already.

/**
 * @brief Initialise host-owned timer storage, link it, and schedule its first
 *        run one period from now (lv_timer_create).
 *
 * The timer starts unpaused with a repeat count of -1 (forever). "Now" is
 * u8g2gl_tick_now(), so the tick callback should be registered first.
 *
 * Calling this on a timer that is already linked re-initialises it in place:
 * every field is reset and the schedule restarts, but it is not linked twice.
 * Called from a timer callback, the new or re-initialised timer does not run in
 * the same pass unless it is already due, which a period of at least 1 ms
 * rules out.
 *
 * @param timer     Storage to initialise. Must stay at this address until it is
 *                  deleted or destroyed. Ignored if nullptr.
 * @param cb        Called each time the timer runs. nullptr is allowed and runs
 *                  nothing.
 * @param period_ms Interval between runs. 0 is treated as 1 ms: a zero period
 *                  would be due again on every pass and the loop could never
 *                  sleep. Must be below 2^31 ms (about 24.8 days): wrapping
 *                  arithmetic cannot tell a due time further ahead than that
 *                  from one in the past.
 * @param user_data Context for the callback; not dereferenced by the library.
 */
void u8g2gl_timer_init(u8g2gl_timer* timer, u8g2gl_timer_cb_t cb, uint32_t period_ms, void* user_data);

/**
 * @brief Unlink a timer, so it never runs again until re-initialised
 *        (lv_timer_delete).
 *
 * The storage is the host's and is not freed. Deleting an unlinked timer —
 * one never initialised, or already deleted — does nothing. Safe from inside
 * any timer callback, including the timer's own.
 *
 * @param timer Timer to unlink. Ignored if nullptr.
 */
void u8g2gl_timer_delete(u8g2gl_timer* timer);

// --- Control ---

/**
 * @brief Stop the timer running (lv_timer_pause). Its due time is kept.
 * @param timer Timer to pause. Ignored if nullptr.
 */
void u8g2gl_timer_pause(u8g2gl_timer* timer);

/**
 * @brief Let a paused timer run again (lv_timer_resume).
 *
 * The schedule kept while paused stands: a timer resumed before its due time
 * runs then; one resumed after it runs on the next pass, once, and then resyncs
 * to one period after that pass.
 *
 * @param timer Timer to resume. Ignored if nullptr.
 */
void u8g2gl_timer_resume(u8g2gl_timer* timer);

/**
 * @brief Change the period (lv_timer_set_period).
 *
 * As in LVGL, the time to the next run is measured from the last run against
 * the new period. Exactly: the next run becomes due at (the previous due time,
 * or the init/reset time before the first run) + @p period_ms. If that moment
 * has already passed, the timer runs on the next pass. Called from the timer's
 * own callback, "the last run" is the run in progress, measured from its due
 * time.
 *
 * @param timer     Timer to change. Ignored if nullptr.
 * @param period_ms New interval. 0 is treated as 1 ms, as for init.
 */
void u8g2gl_timer_set_period(u8g2gl_timer* timer, uint32_t period_ms);

/**
 * @brief Make the timer due now, so it runs on the next pass (lv_timer_ready).
 *
 * Called from a callback during a pass, on a timer that has already run in that
 * pass, the timer runs on the next pass and u8g2gl_timer_handler() returns 0 to
 * say so. A paused timer stays paused.
 *
 * @param timer Timer to make ready. Ignored if nullptr.
 */
void u8g2gl_timer_ready(u8g2gl_timer* timer);

/**
 * @brief Restart the period from now: the next run is due one period after
 *        u8g2gl_tick_now() (lv_timer_reset).
 * @param timer Timer to reset. Ignored if nullptr.
 */
void u8g2gl_timer_reset(u8g2gl_timer* timer);

/**
 * @brief Set how many more times the timer runs (lv_timer_set_repeat_count).
 *
 * Each run decrements a positive count. When it reaches 0 the timer **pauses**
 * rather than deleting itself, because the storage is the host's and there is
 * nothing to free; set a new count and resume to run it again. -1 (the default)
 * runs forever. Setting 0 directly pauses the timer at once.
 *
 * Called from the timer's own callback, the new count replaces the one the
 * current run has already consumed, so `set_repeat_count(t, 3)` there means
 * three more runs after this one.
 *
 * @param timer        Timer to change. Ignored if nullptr.
 * @param repeat_count Runs left, or -1 for forever.
 */
void u8g2gl_timer_set_repeat_count(u8g2gl_timer* timer, int32_t repeat_count);

// --- Query ---

/**
 * @brief The user_data passed to u8g2gl_timer_init().
 * @return nullptr if @p timer is nullptr or was never initialised.
 */
void* u8g2gl_timer_get_user_data(const u8g2gl_timer* timer);

// --- Handler ---

/**
 * @brief Run every due, unpaused timer once, and report when the next is due.
 *
 * ui_handler() calls this before ticking widgets, so a subject a timer writes
 * is drawn in the same frame. An application does not call it directly.
 *
 * A timer is due when `now - due >= 0` in wrapping 32-bit arithmetic. Before
 * its callback runs, its next due time is moved one period on from the previous
 * due time; if it was a whole period or more late, it runs once and resyncs to
 * `now + period` instead, so a stalled loop never triggers a burst of catch-up
 * runs.
 *
 * @param now Current tick, as ui_handler() read it.
 * @return Milliseconds until the earliest unpaused timer is due, or
 *         U8G2GL_IDLE when there is none. Never 0 unless a timer became due
 *         during the pass — u8g2gl_timer_ready() from a callback, for example —
 *         in which case it is due again at once.
 */
uint32_t u8g2gl_timer_handler(uint32_t now);

#endif // U8G2GL_TIMER_H

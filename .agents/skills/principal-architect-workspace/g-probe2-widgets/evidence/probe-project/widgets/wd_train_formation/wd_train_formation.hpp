/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: widgets/wd_train_formation/wd_train_formation.hpp
 * Purpose: Custom formation widget displaying horizontal carriage outlines
 *          with per-carriage class, wheelchair, bike and loading indicators.
 *
 * Description: Declarations for the wd_train_formation widget class. Provides
 *              static non-heap storage, begin/add_carriage/commit data ingestion
 *              API (§9.2), and U8G2 horizontal strip rendering with pixel arithmetic.
 *
 * Exported Classes:
 * - wd_train_formation: Train formation widget extending u8g2gl_obj.
 *     Configuration:
 *     - set_font():          Font for carriage number labels
 *     - set_max_carriages(): Static carriage capacity limit
 *
 *     Ingestion (§9.2):
 *     - begin():             Reset staging index for incoming batch
 *     - add_carriage():      Stage one carriage record
 *     - commit():            Publish staged carriages and request repaint
 *     - capacity():          Declared carriage capacity
 *     - carriage_count():    Currently committed carriage count
 *     - get_carriage():      Const inspect committed carriage record
 *
 *     Lifecycle (override):
 *     - render():            Draw carriage outlines, loading gauge, and indicators
 */
#ifndef WD_TRAIN_FORMATION_HPP
#define WD_TRAIN_FORMATION_HPP

#include <cstddef>
#include <cstdint>
#include "u8g2gl/u8g2gl_obj.h"

class U8G2;

/**
 * @brief Carriage class distinction.
 */
enum u8g2gl_carriage_class_t : uint8_t {
    U8G2GL_CARRIAGE_STANDARD = 0,
    U8G2GL_CARRIAGE_FIRST = 1,
};

/**
 * @brief Per-carriage display data record.
 */
struct u8g2gl_carriage_t {
    uint8_t number{0};
    uint8_t loading_pct{0};
    bool is_first_class{false};
    bool has_wheelchair{false};
    bool has_bike{false};
};

/**
 * @brief Train formation widget displaying horizontal carriage outlines with
 *        per-carriage class, wheelchair, bike and loading indicators.
 */
class wd_train_formation : public u8g2gl_obj {
public:
    static constexpr size_t DEFAULT_MAX_CARRIAGES = 16;

    wd_train_formation() = default;
    ~wd_train_formation() override = default;

    // --- Configuration setters (emitted from <prop> in manifest) ---

    /**
     * @brief Set font used to render carriage numbers.
     * @param font U8G2 font pointer.
     */
    void set_font(const uint8_t* font);

    /**
     * @brief Set maximum carriage capacity (clamped to static array bounds).
     * @param max_carriages Requested carriage capacity.
     */
    void set_max_carriages(int16_t max_carriages);

    // --- Data ingestion API (§9.2) ---

    /**
     * @brief Start a data batch, resetting the staging write pointer to 0.
     */
    void begin();

    /**
     * @brief Add a carriage record to the staging buffer.
     * @param number Carriage ordinal or coach number (1..99).
     * @param class_type Class string ("first", "standard", etc.).
     * @param wheelchair Whether carriage provides wheelchair space.
     * @param bike Whether carriage provides bicycle storage space.
     * @param loading_pct Passenger loading percentage (0..100).
     * @return true if accepted, false if capacity exceeded.
     */
    bool add_carriage(uint8_t number, const char* class_type, bool wheelchair, bool bike, uint8_t loading_pct);

    /**
     * @brief Add a carriage record with boolean first-class flag.
     * @param number Carriage ordinal or coach number (1..99).
     * @param is_first_class True if first class carriage, false if standard.
     * @param wheelchair Whether carriage provides wheelchair space.
     * @param bike Whether carriage provides bicycle storage space.
     * @param loading_pct Passenger loading percentage (0..100).
     * @return true if accepted, false if capacity exceeded.
     */
    bool add_carriage(uint8_t number, bool is_first_class, bool wheelchair, bool bike, uint8_t loading_pct);

    /**
     * @brief Commit staged carriages, publishing to the display and marking dirty.
     */
    void commit();

    /**
     * @brief Return carriage capacity.
     */
    size_t capacity() const;

    /**
     * @brief Return number of committed carriages currently stored.
     */
    size_t carriage_count() const;

    /**
     * @brief Retrieve carriage data at index.
     * @param index Carriage index (0..carriage_count-1).
     * @return Pointer to carriage record, or nullptr if out of bounds.
     */
    const u8g2gl_carriage_t* get_carriage(size_t index) const;

    // --- Lifecycle override ---

    /**
     * @brief Render committed carriages to the U8G2 display buffer.
     * @param display The U8G2 display driver instance.
     */
    void render(U8G2& display) override;

private:
    const uint8_t* font_{nullptr};
    size_t max_carriages_{DEFAULT_MAX_CARRIAGES};
    size_t current_carriage_index_{0};
    size_t carriage_count_{0};
    u8g2gl_carriage_t carriages_[DEFAULT_MAX_CARRIAGES]{};
};

#endif // WD_TRAIN_FORMATION_HPP

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
 * Description: Declarations for the wd_train_formation widget class: the
 *              begin/add_carriage/commit data ingestion API (§9.2), and U8G2
 *              horizontal strip rendering with pixel arithmetic. Its carriages
 *              live in storage the generator allocates for each instance from
 *              its `<data>`, max_carriages rows of the five fields, handed over
 *              through attach_rows(); the widget owns no array of its own.
 *
 * Exported Classes:
 * - wd_train_formation: Train formation widget extending u8g2gl_obj.
 *     Configuration:
 *     - set_font():          Font for carriage number labels
 *     - set_max_carriages(): Sizes the generated storage; no effect at run time
 *
 *     Ingestion (§9.2):
 *     - begin():             Reset staging index for incoming batch
 *     - add_carriage():      Stage one carriage record
 *     - commit():            Publish staged carriages and request repaint
 *     - capacity():          Declared carriage capacity
 *     - carriage_count():    Currently committed carriage count
 *     - get_carriage():      Read one committed carriage back
 *
 *     Lifecycle (override):
 *     - attach_rows():       Keep the view over the generated storage (§9.2)
 *     - render():            Draw carriage outlines, loading gauge, and indicators
 */
#ifndef WD_TRAIN_FORMATION_HPP
#define WD_TRAIN_FORMATION_HPP

#include <cstddef>
#include <cstdint>
#include "u8g2gl/u8g2gl_obj.h"
#include "u8g2gl/u8g2gl_rows.h"

class U8G2;

/**
 * @brief Carriage class distinction.
 */
enum u8g2gl_carriage_class_t : uint8_t {
    U8G2GL_CARRIAGE_STANDARD = 0,
    U8G2GL_CARRIAGE_FIRST = 1,
};

/**
 * @brief One carriage, as get_carriage() reads it back from the row storage.
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
    wd_train_formation() = default;
    ~wd_train_formation() override = default;

    // --- Configuration setters (emitted from <prop> in manifest) ---

    /**
     * @brief Set font used to render carriage numbers.
     * @param font U8G2 font pointer.
     */
    void set_font(const uint8_t* font);

    /**
     * @brief Carriage capacity: the generator sizes this instance's storage
     *        from it (§9.2), and the widget reads its capacity from the view
     *        attach_rows() hands it. No effect at run time.
     * @param max_carriages Declared carriage capacity.
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
     * @return true if accepted; false if the storage is full, or none is attached.
     */
    bool add_carriage(uint8_t number, const char* class_type, bool wheelchair, bool bike, uint8_t loading_pct);

    /**
     * @brief Add a carriage record with boolean first-class flag.
     * @param number Carriage ordinal or coach number (1..99).
     * @param is_first_class True if first class carriage, false if standard.
     * @param wheelchair Whether carriage provides wheelchair space.
     * @param bike Whether carriage provides bicycle storage space.
     * @param loading_pct Passenger loading percentage (0..100).
     * @return true if accepted; false if the storage is full, or none is attached.
     */
    bool add_carriage(uint8_t number, bool is_first_class, bool wheelchair, bool bike, uint8_t loading_pct);

    /**
     * @brief Commit staged carriages, publishing to the display and marking dirty.
     */
    void commit();

    /**
     * @brief Return carriage capacity: the attached storage's rows, 0 with none.
     */
    size_t capacity() const;

    /**
     * @brief Return number of committed carriages currently stored.
     */
    size_t carriage_count() const;

    /**
     * @brief Read one committed carriage back from the row storage.
     * @param index Carriage index (0..carriage_count-1).
     * @param out   Receives the carriage; untouched when `index` is out of bounds.
     * @return false if `index` is not a committed carriage.
     */
    bool get_carriage(size_t index, u8g2gl_carriage_t* out) const;

    // --- Lifecycle overrides ---

    /**
     * @brief Keep the view over this instance's `carriages` storage (§9.2).
     * @param data_index 0, the manifest's one `<data>`; any other is ignored.
     * @param rows       The generated storage: number, class_type, wheelchair,
     *                   bike and loading_pct, in that order.
     */
    void attach_rows(uint8_t data_index, const u8g2gl_rows& rows) override;

    /**
     * @brief Render committed carriages to the U8G2 display buffer.
     * @param display The U8G2 display driver instance.
     */
    void render(U8G2& display) override;

private:
    const uint8_t* font_{nullptr};
    size_t current_carriage_index_{0};
    size_t carriage_count_{0};
    // The carriages, in the generator's storage. A batch writes in place and
    // commit() publishes the count (§9.2).
    u8g2gl_rows rows_{};
};

#endif // WD_TRAIN_FORMATION_HPP

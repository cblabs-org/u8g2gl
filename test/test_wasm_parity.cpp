/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/test_wasm_parity.cpp
 *
 * Purpose: D-9 parity proof — the native (CMake) and Wasm (Emscripten) builds
 *          must produce byte-identical pixel buffers for the same scene.
 *
 * Description: Calls the same bridge functions the Wasm snapshot test uses, but
 *              compiled natively. Renders the emit-project fixture scene into a
 *              real U8G2 pixel buffer, computes its SHA-256, and asserts it
 *              matches the golden hash. The Wasm snapshot test asserts the same
 *              hash, proving both builds produce identical pixels.
 *
 *              This is the proof [D-9] requires: the preview is the runtime,
 *              not a second implementation that could drift.
 */
#include <gtest/gtest.h>

#include <array>
#include <cstdint>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

// SHA-256 — a minimal single-header implementation for this one test.
// The bridge functions are declared in the bridge header.
extern "C" {
    int applyScene(const char* scene_json_str);
    uint8_t* renderFrame(uint32_t current_ms);
    int getDisplayWidth();
    int getDisplayHeight();
    int getBufferSize();
    void teardown();
}

namespace {

// Minimal SHA-256 implementation (FIPS 180-4)
// Only used in this test; not part of the runtime.
class sha256 {
public:
    sha256() { reset(); }

    void update(const uint8_t* data, size_t len) {
        for (size_t i = 0; i < len; ++i) {
            buf_[buf_len_++] = data[i];
            if (buf_len_ == 64) {
                transform();
                total_ += 512;
                buf_len_ = 0;
            }
        }
    }

    std::string hex_digest() {
        // Pad
        total_ += buf_len_ * 8;
        buf_[buf_len_++] = 0x80;
        while (buf_len_ != 56) {
            if (buf_len_ == 64) {
                transform();
                buf_len_ = 0;
            }
            buf_[buf_len_++] = 0;
        }
        for (int i = 7; i >= 0; --i) {
            buf_[buf_len_++] = static_cast<uint8_t>(total_ >> (i * 8));
        }
        transform();

        char hex[65];
        for (int i = 0; i < 8; ++i) {
            std::snprintf(hex + i * 8, 9, "%08x", h_[i]);
        }
        hex[64] = '\0';
        return std::string(hex);
    }

private:
    uint32_t h_[8]{};
    uint8_t buf_[64]{};
    size_t buf_len_ = 0;
    uint64_t total_ = 0;

    void reset() {
        h_[0] = 0x6a09e667; h_[1] = 0xbb67ae85;
        h_[2] = 0x3c6ef372; h_[3] = 0xa54ff53a;
        h_[4] = 0x510e527f; h_[5] = 0x9b05688c;
        h_[6] = 0x1f83d9ab; h_[7] = 0x5be0cd19;
        buf_len_ = 0;
        total_ = 0;
    }

    static uint32_t rotr(uint32_t x, int n) { return (x >> n) | (x << (32 - n)); }
    static uint32_t ch(uint32_t x, uint32_t y, uint32_t z) { return (x & y) ^ (~x & z); }
    static uint32_t maj(uint32_t x, uint32_t y, uint32_t z) { return (x & y) ^ (x & z) ^ (y & z); }
    static uint32_t ep0(uint32_t x) { return rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22); }
    static uint32_t ep1(uint32_t x) { return rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25); }
    static uint32_t sig0(uint32_t x) { return rotr(x, 7) ^ rotr(x, 18) ^ (x >> 3); }
    static uint32_t sig1(uint32_t x) { return rotr(x, 17) ^ rotr(x, 19) ^ (x >> 10); }

    void transform() {
        static constexpr uint32_t k[64] = {
            0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
            0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
            0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
            0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
            0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
            0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
            0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
            0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
        };
        uint32_t w[64];
        for (int i = 0; i < 16; ++i) {
            w[i] = (uint32_t(buf_[i*4]) << 24) | (uint32_t(buf_[i*4+1]) << 16)
                 | (uint32_t(buf_[i*4+2]) << 8) | uint32_t(buf_[i*4+3]);
        }
        for (int i = 16; i < 64; ++i) {
            w[i] = sig1(w[i-2]) + w[i-7] + sig0(w[i-15]) + w[i-16];
        }
        uint32_t a=h_[0], b=h_[1], c=h_[2], d=h_[3],
                 e=h_[4], f=h_[5], g=h_[6], h=h_[7];
        for (int i = 0; i < 64; ++i) {
            uint32_t t1 = h + ep1(e) + ch(e,f,g) + k[i] + w[i];
            uint32_t t2 = ep0(a) + maj(a,b,c);
            h=g; g=f; f=e; e=d+t1; d=c; c=b; b=a; a=t1+t2;
        }
        h_[0]+=a; h_[1]+=b; h_[2]+=c; h_[3]+=d;
        h_[4]+=e; h_[5]+=f; h_[6]+=g; h_[7]+=h;
    }
};

}  // namespace

// WasmParity.NativeMatchesWasm
// Loads the emit-project fixture scene through the same bridge code the Wasm
// build uses, renders a frame, and asserts the pixel buffer's SHA-256 matches
// the golden hash. The Wasm snapshot test asserts the same hash.
TEST(WasmParity, NativeMatchesWasm) {
    // --- Step 1: Load scene JSON ---
    std::ifstream file(U8G2GL_EDITOR_SCENE_PATH);
    ASSERT_TRUE(file.good()) << "cannot open scene: " << U8G2GL_EDITOR_SCENE_PATH;
    std::ostringstream ss;
    ss << file.rdbuf();
    std::string scene_str = ss.str();
    ASSERT_FALSE(scene_str.empty());

    // --- Step 2: Apply scene ---
    ASSERT_TRUE(applyScene(scene_str.c_str())) << "applyScene failed";
    EXPECT_EQ(getDisplayWidth(), 128);
    EXPECT_EQ(getDisplayHeight(), 64);

    // --- Step 3: Render frame ---
    uint8_t* buffer = renderFrame(0);
    ASSERT_NE(buffer, nullptr) << "renderFrame returned nullptr";
    int buf_size = getBufferSize();
    ASSERT_GT(buf_size, 0);

    // --- Step 4: Compute SHA-256 ---
    sha256 hasher;
    hasher.update(buffer, static_cast<size_t>(buf_size));
    std::string hash = hasher.hex_digest();

    // --- Step 5: Count lit pixels ---
    int lit = 0;
    for (int i = 0; i < buf_size; ++i) {
        uint8_t byte = buffer[i];
        while (byte) { lit += byte & 1; byte >>= 1; }
    }

    std::printf("  Display:    %dx%d\n", getDisplayWidth(), getDisplayHeight());
    std::printf("  Buffer:     %d bytes\n", buf_size);
    std::printf("  Lit pixels: %d\n", lit);
    std::printf("  SHA-256:    %s\n", hash.c_str());

    // --- Step 6: Assert D-9 parity ---
    // This hash is the golden: both the native and Wasm builds must produce it.
    // If this test fails, the native rendering changed. If the Wasm snapshot
    // test fails, the Wasm rendering diverged from native. Either way, [D-9]
    // parity is broken and needs investigation.
    EXPECT_GT(lit, 0) << "frame is empty — no pixels lit";
    EXPECT_EQ(hash, U8G2GL_PARITY_SHA256)
        << "D-9 parity broken: native SHA-256 does not match the golden.\n"
           "If intentional (e.g. font or layout change), update U8G2GL_PARITY_SHA256\n"
           "in test/CMakeLists.txt and wasm/test/snapshot.test.mjs to the new hash.";

    // --- Step 7: Teardown ---
    teardown();
}

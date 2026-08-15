#include "mtkruto_ige.h"

#include <stddef.h>
#include <string.h>

#if defined(__aarch64__) || defined(_M_ARM64)
#include <arm_neon.h>
#define MTKRUTO_ARM64 1
typedef uint8x16_t block128;
#elif defined(__x86_64__) || defined(_M_X64)
#include <wmmintrin.h>
#define MTKRUTO_X86_64 1
typedef __m128i block128;
#else
#error "Only ARM64 and x86-64 are supported."
#endif

#if defined(__linux__) && defined(MTKRUTO_ARM64)
#include <asm/hwcap.h>
#include <sys/auxv.h>
#endif

static const uint8_t sbox[256] = {
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16};

typedef struct aes256_schedule {
  block128 encryption[15];
  block128 decryption[15];
} aes256_schedule;

static void expand_aes256_key(const uint8_t key[32], uint8_t round_keys[240]) {
  memcpy(round_keys, key, 32);
  uint32_t generated = 32;
  uint8_t rcon = 1;
  uint8_t temp[4];

  while (generated < 240) {
    memcpy(temp, round_keys + generated - 4, 4);
    if ((generated & 31U) == 0) {
      const uint8_t first = temp[0];
      temp[0] = (uint8_t)(sbox[temp[1]] ^ rcon);
      temp[1] = sbox[temp[2]];
      temp[2] = sbox[temp[3]];
      temp[3] = sbox[first];
      rcon = (uint8_t)((rcon << 1) ^ ((rcon & 0x80U) ? 0x1bU : 0));
    } else if ((generated & 31U) == 16) {
      temp[0] = sbox[temp[0]];
      temp[1] = sbox[temp[1]];
      temp[2] = sbox[temp[2]];
      temp[3] = sbox[temp[3]];
    }

    for (uint32_t i = 0; i < 4; ++i) {
      round_keys[generated] = (uint8_t)(round_keys[generated - 32] ^ temp[i]);
      ++generated;
    }
  }
}

#if defined(MTKRUTO_ARM64)

static inline block128 load_block(const uint8_t *input) { return vld1q_u8(input); }

static inline void store_block(uint8_t *output, block128 block) { vst1q_u8(output, block); }

static inline block128 xor_block(block128 a, block128 b) { return veorq_u8(a, b); }

static void prepare_schedule(const uint8_t key[32], aes256_schedule *schedule) {
  uint8_t round_keys[240];
  expand_aes256_key(key, round_keys);
  for (int round = 0; round < 15; ++round) {
    schedule->encryption[round] = vld1q_u8(round_keys + round * 16);
  }
  schedule->decryption[0] = schedule->encryption[14];
  for (int round = 1; round < 14; ++round) {
    schedule->decryption[round] = vaesimcq_u8(schedule->encryption[14 - round]);
  }
  schedule->decryption[14] = schedule->encryption[0];
}

static inline block128 encrypt_block(block128 block, const aes256_schedule *schedule) {
  for (int round = 0; round < 13; ++round) {
    block = vaeseq_u8(block, schedule->encryption[round]);
    block = vaesmcq_u8(block);
  }
  block = vaeseq_u8(block, schedule->encryption[13]);
  return veorq_u8(block, schedule->encryption[14]);
}

static inline block128 decrypt_block(block128 block, const aes256_schedule *schedule) {
  for (int round = 0; round < 13; ++round) {
    block = vaesdq_u8(block, schedule->decryption[round]);
    block = vaesimcq_u8(block);
  }
  block = vaesdq_u8(block, schedule->decryption[13]);
  return veorq_u8(block, schedule->decryption[14]);
}

#elif defined(MTKRUTO_X86_64)

static inline block128 load_block(const uint8_t *input) {
  return _mm_loadu_si128((const __m128i *)input);
}

static inline void store_block(uint8_t *output, block128 block) {
  _mm_storeu_si128((__m128i *)output, block);
}

static inline block128 xor_block(block128 a, block128 b) { return _mm_xor_si128(a, b); }

static void prepare_schedule(const uint8_t key[32], aes256_schedule *schedule) {
  uint8_t round_keys[240];
  expand_aes256_key(key, round_keys);
  for (int round = 0; round < 15; ++round) {
    schedule->encryption[round] = _mm_loadu_si128((const __m128i *)(round_keys + round * 16));
  }
  schedule->decryption[0] = schedule->encryption[14];
  for (int round = 1; round < 14; ++round) {
    schedule->decryption[round] = _mm_aesimc_si128(schedule->encryption[14 - round]);
  }
  schedule->decryption[14] = schedule->encryption[0];
}

static inline block128 encrypt_block(block128 block, const aes256_schedule *schedule) {
  block = _mm_xor_si128(block, schedule->encryption[0]);
  for (int round = 1; round < 14; ++round) {
    block = _mm_aesenc_si128(block, schedule->encryption[round]);
  }
  return _mm_aesenclast_si128(block, schedule->encryption[14]);
}

static inline block128 decrypt_block(block128 block, const aes256_schedule *schedule) {
  block = _mm_xor_si128(block, schedule->decryption[0]);
  for (int round = 1; round < 14; ++round) {
    block = _mm_aesdec_si128(block, schedule->decryption[round]);
  }
  return _mm_aesdeclast_si128(block, schedule->decryption[14]);
}

#endif

uint32_t mtkruto_ige_abi_version(void) { return 1; }

int32_t mtkruto_ige256_supported(void) {
#if defined(MTKRUTO_X86_64) && (defined(__GNUC__) || defined(__clang__))
  return __builtin_cpu_supports("aes") ? 1 : 0;
#elif defined(MTKRUTO_ARM64) && defined(__linux__)
  return (getauxval(AT_HWCAP) & HWCAP_AES) != 0 ? 1 : 0;
#elif defined(MTKRUTO_ARM64) && defined(__APPLE__)
  return 1;
#else
  return 0;
#endif
}

static int32_t transform_ige(const uint8_t *input, uint8_t *output, uint32_t length,
                             const uint8_t key[32], const uint8_t iv[32], int encrypt) {
  if (input == NULL || output == NULL || key == NULL || iv == NULL) {
    return MTKRUTO_IGE_INVALID_ARGUMENT;
  }
  if (length == 0 || (length & 15U) != 0) {
    return MTKRUTO_IGE_INVALID_LENGTH;
  }
  if (!mtkruto_ige256_supported()) {
    return MTKRUTO_IGE_UNSUPPORTED_CPU;
  }

  aes256_schedule schedule;
  prepare_schedule(key, &schedule);

  block128 previous_cipher = load_block(iv);
  block128 previous_plain = load_block(iv + 16);
  for (uint32_t offset = 0; offset < length; offset += 16) {
    if (encrypt) {
      const block128 plain = load_block(input + offset);
      block128 cipher = encrypt_block(xor_block(plain, previous_cipher), &schedule);
      cipher = xor_block(cipher, previous_plain);
      store_block(output + offset, cipher);
      previous_cipher = cipher;
      previous_plain = plain;
    } else {
      const block128 cipher = load_block(input + offset);
      block128 plain = decrypt_block(xor_block(cipher, previous_plain), &schedule);
      plain = xor_block(plain, previous_cipher);
      store_block(output + offset, plain);
      previous_cipher = cipher;
      previous_plain = plain;
    }
  }

  return MTKRUTO_IGE_OK;
}

int32_t mtkruto_ige256_encrypt(const uint8_t *input, uint8_t *output, uint32_t length,
                               const uint8_t key[32], const uint8_t iv[32]) {
  return transform_ige(input, output, length, key, iv, 1);
}

int32_t mtkruto_ige256_decrypt(const uint8_t *input, uint8_t *output, uint32_t length,
                               const uint8_t key[32], const uint8_t iv[32]) {
  return transform_ige(input, output, length, key, iv, 0);
}

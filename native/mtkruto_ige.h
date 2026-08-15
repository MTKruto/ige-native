#ifndef MTKRUTO_IGE_H
#define MTKRUTO_IGE_H

#include <stdint.h>

#if defined(_WIN32)
#define MTKRUTO_EXPORT __declspec(dllexport)
#else
#define MTKRUTO_EXPORT __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

enum {
  MTKRUTO_IGE_OK = 0,
  MTKRUTO_IGE_INVALID_ARGUMENT = -1,
  MTKRUTO_IGE_INVALID_LENGTH = -2,
  MTKRUTO_IGE_UNSUPPORTED_CPU = -3,
};

MTKRUTO_EXPORT uint32_t mtkruto_ige_abi_version(void);
MTKRUTO_EXPORT int32_t mtkruto_ige256_supported(void);
MTKRUTO_EXPORT int32_t mtkruto_ige256_encrypt(const uint8_t *input, uint8_t *output,
                                              uint32_t length, const uint8_t key[32],
                                              const uint8_t iv[32]);
MTKRUTO_EXPORT int32_t mtkruto_ige256_decrypt(const uint8_t *input, uint8_t *output,
                                              uint32_t length, const uint8_t key[32],
                                              const uint8_t iv[32]);

#ifdef __cplusplus
}
#endif

#endif

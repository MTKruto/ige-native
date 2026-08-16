#include "mtkruto_ige.h"

#include <node_api.h>

#include <limits.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <stdint.h>

typedef struct byte_view {
  uint8_t *data;
  size_t length;
} byte_view;

static int is_shared_array_buffer(napi_env env, napi_value value, bool *result) {
  napi_value constructor;
  napi_value global;
  napi_valuetype constructor_type;

  *result = false;
  if (napi_get_global(env, &global) != napi_ok ||
      napi_get_named_property(env, global, "SharedArrayBuffer", &constructor) != napi_ok ||
      napi_typeof(env, constructor, &constructor_type) != napi_ok) {
    return 0;
  }
  if (constructor_type != napi_function) {
    return 1;
  }
  return napi_instanceof(env, value, constructor, result) == napi_ok;
}

static napi_value throw_napi_failure(napi_env env) {
  const napi_extended_error_info *info = NULL;
  const char *message = "A Node-API operation failed.";
  bool exception_pending = false;

  if (napi_is_exception_pending(env, &exception_pending) == napi_ok && exception_pending) {
    return NULL;
  }
  if (napi_get_last_error_info(env, &info) == napi_ok && info != NULL && info->error_message != NULL) {
    message = info->error_message;
  }
  napi_throw_error(env, "ERR_MTKRUTO_NAPI", message);
  return NULL;
}

#define NAPI_CALL_OR_RETURN(env, expression)                                                        \
  do {                                                                                              \
    if ((expression) != napi_ok) {                                                                  \
      return throw_napi_failure(env);                                                               \
    }                                                                                               \
  } while (0)

static int validate_byte_view(napi_env env, napi_value value, const char *message) {
  bool is_typed_array = false;
  bool is_shared = false;
  napi_typedarray_type type;
  napi_value array_buffer;

  if (napi_is_typedarray(env, value, &is_typed_array) != napi_ok) {
    throw_napi_failure(env);
    return 0;
  }
  if (!is_typed_array) {
    napi_throw_type_error(env, "ERR_INVALID_ARG_TYPE", message);
    return 0;
  }
  if (napi_get_typedarray_info(env, value, &type, NULL, NULL, &array_buffer, NULL) != napi_ok) {
    throw_napi_failure(env);
    return 0;
  }
  if (type != napi_uint8_array) {
    napi_throw_type_error(env, "ERR_INVALID_ARG_TYPE", message);
    return 0;
  }
  if (!is_shared_array_buffer(env, array_buffer, &is_shared)) {
    throw_napi_failure(env);
    return 0;
  }
  if (is_shared) {
    napi_throw_type_error(env, "ERR_INVALID_ARG_TYPE", "SharedArrayBuffer-backed views are not supported.");
    return 0;
  }
  return 1;
}

static int get_byte_view(napi_env env, napi_value value, byte_view *view) {
  bool is_array_buffer = false;
  bool is_detached = false;
  napi_value array_buffer;
  void *array_buffer_data;
  void *data;
  size_t array_buffer_length;
  size_t byte_offset;

  if (napi_get_typedarray_info(env, value, NULL, &view->length, &data, &array_buffer, &byte_offset) != napi_ok) {
    throw_napi_failure(env);
    return 0;
  }
  if (napi_is_arraybuffer(env, array_buffer, &is_array_buffer) != napi_ok) {
    throw_napi_failure(env);
    return 0;
  }
  if (!is_array_buffer) {
    napi_throw_type_error(env, "ERR_INVALID_ARG_TYPE", "SharedArrayBuffer-backed views are not supported.");
    return 0;
  }
  if (napi_is_detached_arraybuffer(env, array_buffer, &is_detached) != napi_ok) {
    throw_napi_failure(env);
    return 0;
  }
  if (is_detached) {
    napi_throw_type_error(env, "ERR_INVALID_ARG_TYPE", "Detached Uint8Arrays are not supported.");
    return 0;
  }
  if (napi_get_arraybuffer_info(env, array_buffer, &array_buffer_data, &array_buffer_length) != napi_ok) {
    throw_napi_failure(env);
    return 0;
  }
  if (byte_offset > array_buffer_length || view->length > array_buffer_length - byte_offset ||
      (view->length != 0 && data == NULL)) {
    napi_throw_error(env, "ERR_MTKRUTO_NAPI", "Node-API returned an invalid Uint8Array view.");
    return 0;
  }
  view->data = (uint8_t *)data;
  return 1;
}

static napi_value transform(napi_env env, napi_callback_info info, int encrypt) {
  size_t argc = 3;
  napi_value args[3];
  byte_view input;
  byte_view key;
  byte_view iv;
  napi_value output_buffer;
  napi_value output;
  void *output_data;
  int32_t status;

  NAPI_CALL_OR_RETURN(env, napi_get_cb_info(env, info, &argc, args, NULL, NULL));
  if (argc < 3) {
    napi_throw_type_error(env, "ERR_MISSING_ARGS", "Expected data, key, and IV Uint8Arrays.");
    return NULL;
  }
  if (!validate_byte_view(env, args[0], "Data must be a Uint8Array.") ||
      !validate_byte_view(env, args[1], "Key must be a Uint8Array.") ||
      !validate_byte_view(env, args[2], "IV must be a Uint8Array.")) {
    return NULL;
  }
  if (!get_byte_view(env, args[0], &input) || !get_byte_view(env, args[1], &key) ||
      !get_byte_view(env, args[2], &iv)) {
    return NULL;
  }
  if (input.length == 0 || (input.length & 15U) != 0) {
    napi_throw_range_error(env, "ERR_OUT_OF_RANGE", "Data must be non-empty and divisible by 16 bytes.");
    return NULL;
  }
  if (input.length > UINT32_MAX) {
    napi_throw_range_error(env, "ERR_OUT_OF_RANGE", "Data cannot exceed 4 GiB.");
    return NULL;
  }
  if (key.length != 32) {
    napi_throw_range_error(env, "ERR_OUT_OF_RANGE", "Key must be 32 bytes.");
    return NULL;
  }
  if (iv.length != 32) {
    napi_throw_range_error(env, "ERR_OUT_OF_RANGE", "IV must be 32 bytes.");
    return NULL;
  }

  NAPI_CALL_OR_RETURN(env, napi_create_arraybuffer(env, input.length, &output_data, &output_buffer));
  status = encrypt ? mtkruto_ige256_encrypt(input.data, output_data, (uint32_t)input.length, key.data, iv.data)
                   : mtkruto_ige256_decrypt(input.data, output_data, (uint32_t)input.length, key.data, iv.data);
  if (status == MTKRUTO_IGE_UNSUPPORTED_CPU) {
    napi_throw_error(env, "ERR_MTKRUTO_UNSUPPORTED_CPU",
                     "This CPU does not provide the required hardware AES instructions.");
    return NULL;
  }
  if (status != MTKRUTO_IGE_OK) {
    char message[64];
    snprintf(message, sizeof(message), "Native AES-IGE failed with status %d.", status);
    napi_throw_error(env, "ERR_MTKRUTO_IGE", message);
    return NULL;
  }
  NAPI_CALL_OR_RETURN(
      env, napi_create_typedarray(env, napi_uint8_array, input.length, output_buffer, 0, &output));
  return output;
}

static napi_value ige256_encrypt(napi_env env, napi_callback_info info) {
  return transform(env, info, 1);
}

static napi_value ige256_decrypt(napi_env env, napi_callback_info info) {
  return transform(env, info, 0);
}

static napi_value supported(napi_env env, napi_callback_info info) {
  napi_value result;
  (void)info;
  NAPI_CALL_OR_RETURN(env, napi_get_boolean(env, mtkruto_ige256_supported() == 1, &result));
  return result;
}

static napi_value init(napi_env env, napi_value exports) {
  napi_value abi_version;
  napi_property_descriptor properties[] = {
      {"supported", NULL, supported, NULL, NULL, NULL, napi_default, NULL},
      {"ige256Encrypt", NULL, ige256_encrypt, NULL, NULL, NULL, napi_default, NULL},
      {"ige256Decrypt", NULL, ige256_decrypt, NULL, NULL, NULL, napi_default, NULL},
  };

  if (mtkruto_ige_abi_version() != 1) {
    napi_throw_error(env, "ERR_MTKRUTO_ABI", "Unsupported native AES-IGE ABI version.");
    return NULL;
  }
  NAPI_CALL_OR_RETURN(env, napi_create_uint32(env, 1, &abi_version));
  NAPI_CALL_OR_RETURN(env, napi_set_named_property(env, exports, "abiVersion", abi_version));
  NAPI_CALL_OR_RETURN(env,
                      napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties));
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)

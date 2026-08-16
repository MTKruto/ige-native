{
  "targets": [
    {
      "target_name": "mtkruto_ige",
      "sources": [
        "mtkruto_ige.c",
        "mtkruto_ige_napi.c"
      ],
      "defines": [
        "NAPI_VERSION=7"
      ],
      "conditions": [
        [
          "OS != 'win'",
          {
            "cflags": [
              "-std=c11",
              "-fstack-protector-strong",
              "-Wall",
              "-Wextra",
              "-Werror"
            ]
          }
        ],
        [
          "target_arch == 'arm64' and OS != 'win'",
          {
            "cflags": [
              "-march=armv8-a+crypto"
            ],
            "xcode_settings": {
              "OTHER_CFLAGS": [
                "-march=armv8-a+crypto"
              ]
            }
          }
        ],
        [
          "target_arch == 'x64' and OS != 'win'",
          {
            "cflags": [
              "-maes",
              "-msse2"
            ],
            "xcode_settings": {
              "OTHER_CFLAGS": [
                "-maes",
                "-msse2"
              ]
            }
          }
        ],
        [
          "OS == 'mac'",
          {
            "xcode_settings": {
              "GCC_C_LANGUAGE_STANDARD": "c11",
              "GCC_WARN_64_TO_32_BIT_CONVERSION": "YES",
              "GCC_WARN_ABOUT_RETURN_TYPE": "YES",
              "GCC_WARN_UNINITIALIZED_AUTOS": "YES",
              "GCC_WARN_UNUSED_VARIABLE": "YES",
              "MACOSX_DEPLOYMENT_TARGET": "11.0"
            }
          }
        ],
        [
          "OS == 'win'",
          {
            "msvs_settings": {
              "VCCLCompilerTool": {
                "WarningLevel": 4
              },
              "VCLinkerTool": {
                "AdditionalOptions": [
                  "/Brepro"
                ]
              }
            }
          }
        ]
      ]
    }
  ]
}

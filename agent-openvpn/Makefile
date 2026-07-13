# Makefile for the webOS OpenVPN VPN-agent plugin.
#
# Cross-compiles src/openvpn_agent.c into libVpnOpenvpnAgent.so for the
# TouchPad (ARMv7-A, EABI5 softfp, kernel 2.6.35, glibc). Verified toolchain:
#   /opt/gcc-linaro-4.9.4-2017.01-x86_64_arm-linux-gnueabi  (Linaro GCC 4.9.4)
#
# Target ABI confirmed from the stock libVpncAgent.so (readelf -A):
#   ARMv7-A, VFPv3, NEONv1, softfp (no Tag_ABI_VFP_args) -> -mfloat-abi=softfp.
#
# Usage (defaults below already point at the in-tree sysroot + Linaro tools):
#   make
#   make check          # confirm 32-bit ARM ELF, softfp, entry points, NEEDED
#   make clean

# --- toolchain ---
TOOLCHAIN     ?= /opt/gcc-linaro-4.9.4-2017.01-x86_64_arm-linux-gnueabi
CROSS_COMPILE ?= $(TOOLCHAIN)/bin/arm-linux-gnueabi-
CC            := $(CROSS_COMPILE)gcc

# --- sysroot with the device's libcjson + our json-c shim header ---
# (in-tree; populated by scripts/get-palm-libcjson.sh / pulled off the device)
SYSROOT ?= $(CURDIR)/sysroot

TARGET  := libVpnOpenvpnAgent.so
SRC     := src/openvpn_agent.c
HDR     := src/webos_vpn_agent_abi.h

# Match the device ABI exactly (see header note above).
ARCH    := -march=armv7-a -mfpu=vfpv3-d16 -mfloat-abi=softfp -mthumb
WARN    := -Wall -Wextra -Wno-unused-parameter
STD     := -std=gnu99
OPT     := -O2 -fPIC -fvisibility=hidden

# json-c shim header lives in $(SYSROOT)/usr/include; device libcjson.so in lib.
INCS    := -I$(SYSROOT)/usr/include
LIBDIRS := -L$(SYSROOT)/usr/lib
# Palm ships json-c as libcjson.so -> link -lcjson (NOT -ljson-c).
# GLib main-loop integration (openvpn child/output watches) -> -lglib-2.0.
LIBS    := -lcjson -lglib-2.0

CFLAGS  := $(ARCH) $(STD) $(OPT) $(WARN) $(INCS)
# Export ONLY the two entry points (visibility=hidden + explicit default on them
# in the source). -z defs would fail on json symbols resolved at load; we allow
# lazy binding against libcjson.so like the stock agent does.
LDFLAGS := -shared -Wl,-soname,$(TARGET) $(LIBDIRS)

$(TARGET): $(SRC) $(HDR)
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $(SRC) $(LIBS)
	@echo "---- built $@ ----"
	@$(CROSS_COMPILE)nm -D $@ | grep -E 'initVpnAgent|cleanupVpnAgent' \
	   && echo "OK: entry points exported" || echo "WARN: entry points missing!"

check: $(TARGET)
	@$(CROSS_COMPILE)readelf -h $(TARGET) | grep -E 'Class|Machine|Type'
	@$(CROSS_COMPILE)readelf -A $(TARGET) | grep -E 'CPU_arch|FP_arch|VFP_args' || true
	@echo "-- NEEDED --"; $(CROSS_COMPILE)readelf -d $(TARGET) | grep NEEDED
	@echo "-- dynamic symbols (exported) --"; $(CROSS_COMPILE)nm -D --defined-only $(TARGET)

clean:
	rm -f $(TARGET)

.PHONY: check clean

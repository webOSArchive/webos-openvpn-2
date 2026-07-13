/*
 * json.h  --  minimal json-c (0.9-era) API surface for cross-building the
 * webOS OpenVPN agent against the DEVICE's /usr/lib/libcjson.so.
 *
 * webOS 3.0.5 ships Palm's fork of json-c as libcjson.so (link: -lcjson). The
 * production image strips /usr/include, so this header re-declares exactly the
 * exported json_object_* symbols we use. Prototypes/enum match json-c 0.9 so
 * the compiler emits the correct calls; the real code lives in libcjson.so.
 *
 * Verified against `nm -D libcjson.so` (pulled off the device). Do not add
 * functions that libcjson.so does not export -- the link will fail on-device.
 */
#ifndef WEBOS_JSON_C_SHIM_H
#define WEBOS_JSON_C_SHIM_H

#ifdef __cplusplus
extern "C" {
#endif

/* Opaque object handle. */
struct json_object;

/* json-c boolean is a plain int. */
typedef int json_bool;

/* Value kinds (order matches json-c 0.9 -- used by json_object_is_type). */
typedef enum json_type {
    json_type_null    = 0,
    json_type_boolean = 1,
    json_type_double  = 2,
    json_type_int     = 3,
    json_type_object  = 4,
    json_type_array   = 5,
    json_type_string  = 6
} json_type;

/* --- constructors (each returns a new reference) --- */
extern struct json_object *json_object_new_object(void);
extern struct json_object *json_object_new_array(void);
extern struct json_object *json_object_new_string(const char *s);
extern struct json_object *json_object_new_string_len(const char *s, int len);
extern struct json_object *json_object_new_boolean(json_bool b);
extern struct json_object *json_object_new_int(int i);
extern struct json_object *json_object_new_double(double d);

/* --- object (dict) ops --- */
extern void json_object_object_add(struct json_object *obj, const char *key,
                                   struct json_object *val);
extern struct json_object *json_object_object_get(struct json_object *obj,
                                                  const char *key);
extern json_bool json_object_object_get_ex(struct json_object *obj,
                                           const char *key,
                                           struct json_object **value);
extern void json_object_object_del(struct json_object *obj, const char *key);

/* --- array ops --- */
extern int json_object_array_length(struct json_object *obj);
extern int json_object_array_add(struct json_object *obj,
                                 struct json_object *val);
extern struct json_object *json_object_array_get_idx(struct json_object *obj,
                                                     int idx);

/* --- accessors --- */
extern json_type json_object_get_type(struct json_object *obj);
extern json_bool json_object_is_type(struct json_object *obj, json_type type);
extern const char *json_object_get_string(struct json_object *obj);
extern int json_object_get_int(struct json_object *obj);
extern json_bool json_object_get_boolean(struct json_object *obj);
extern double json_object_get_double(struct json_object *obj);

/* --- serialization / refcount --- */
extern const char *json_object_to_json_string(struct json_object *obj);
extern struct json_object *json_object_get(struct json_object *obj);   /* incref */
extern void json_object_put(struct json_object *obj);                  /* decref */

/* --- tokener (parse) --- */
extern struct json_object *json_tokener_parse(const char *str);

/* Palm/json-c 0.9 names json_object as the concrete type in some headers.
 * Provide the conventional typedef so callers can use `json_object *`. */
typedef struct json_object json_object;

#ifdef __cplusplus
}
#endif

#endif /* WEBOS_JSON_C_SHIM_H */

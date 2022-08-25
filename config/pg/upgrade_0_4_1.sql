-- Generate PNP1 Devices
INSERT INTO mrfp_ops.devices (
    device_id, 
    platform, 
    pushtoken, 
    created, 
    modified, 
    os_versioncode, 
    ap1_level, 
    ap2_level, 
    ap3_level,
    ap4_level, 
    mylocation
) SELECT 
    uuid_in(overlay(overlay(md5(random()::text || ':' || clock_timestamp()::text) placing '4' from 13) placing to_hex(floor(random()*(11-8+1) + 8)::int)::text from 17)::cstring),
    'PNP1', 
    'iughehomwju5oukjy', 
    NOW(), 
    NOW(), 
    '31', 
    4, 
    4, 
    4, 
    4, 
    FALSE 
FROM generate_series(1, 1000000);

-- Generate PNP2 Devices
INSERT INTO mrfp_ops.devices (
    device_id, 
    platform, 
    pushtoken, 
    created, 
    modified, 
    os_versioncode, 
    ap1_level, 
    ap2_level, 
    ap3_level,
    ap4_level, 
    mylocation
) SELECT 
    uuid_in(overlay(overlay(md5(random()::text || ':' || clock_timestamp()::text) placing '4' from 13) placing to_hex(floor(random()*(11-8+1) + 8)::int)::text from 17)::cstring),
    'PNP2', 
    'iughehomwju5oukjy98y5sghoh9=', 
    NOW(), 
    NOW(), 
    '85', 
    4, 
    4, 
    4, 
    4, 
    FALSE 
FROM generate_series(1, 1000000);
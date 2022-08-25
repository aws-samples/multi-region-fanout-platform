-- Warncell 11 as example

DELETE FROM mrfp_ops.warncells WHERE warncell_id = 11;
DELETE FROM mrfp_ops.geos WHERE region_key = 'R11';

INSERT INTO mrfp_ops.warncells (
    warncell_id,
    wkb_geometry
) VALUES (
    11,
    ST_AsText('MULTIPOLYGON (((1 5, 5 5, 5 1, 1 1, 1 5)), ((6 5, 9 1, 6 1, 6 5)))')
);

INSERT INTO mrfp_ops.geos (
    region_key,
    zcurve_gem,
    wkb_geometry
) VALUES (
    'R11',
    11,
    ST_AsText('MULTIPOLYGON (((1 5, 5 5, 5 1, 1 1, 1 5)), ((6 5, 9 1, 6 1, 6 5)))')
);
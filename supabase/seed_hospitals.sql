-- ============================================================================
-- CPVS — seed the 11 AAU clinical practice hospitals
--
-- SAFETY: every insert is guarded by `where not exists (... where name = ...)`,
-- so running this file twice — or against a database that already has some
-- of these hospitals — never creates duplicates and never touches existing
-- rows. Existing hospitals (including ones a coordinator already edited)
-- are left completely alone.
--
-- Requires migration 0002 (adds `address`, `is_active`) to already be applied.
--
-- COORDINATE ACCURACY NOTE:
-- 9 of these 11 use verified published coordinates (Wikipedia / OpenStreetMap-
-- sourced). Two — Federal Police Hospital and Ethiopian Armed Forces
-- Comprehensive Specialized Hospital — do not have reliable public GPS data,
-- so they're seeded with an approximate central-Addis-Ababa placeholder and
-- an explicit warning in their `address` field. A coordinator MUST correct
-- these two via the map picker (or manual entry) before relying on them for
-- real attendance geofencing — do not leave them as-is in production.
--
-- Also note: Tikur Anbessa Specialized Hospital is seeded at its verified
-- Wikipedia/OpenStreetMap coordinate (9.0201, 38.7500), which differs from
-- the (9.0194, 38.7665) example figure — that longitude would place the
-- geofence about 1.8km east of the hospital's actual campus. Adjust via the
-- map picker if your institution's own survey differs.
-- ============================================================================

insert into hospitals (name, address, latitude, longitude, radius_meters, checkin_start_time, is_active)
select 'Tikur Anbessa Specialized Hospital', 'Sidist Kilo, Addis Ababa', 9.0201, 38.7500, 150, '09:00', true
where not exists (select 1 from hospitals where name = 'Tikur Anbessa Specialized Hospital');

insert into hospitals (name, address, latitude, longitude, radius_meters, checkin_start_time, is_active)
select 'Zewditu Memorial Hospital', 'Taitu St, Addis Ababa', 9.0183, 38.7561, 150, '09:00', true
where not exists (select 1 from hospitals where name = 'Zewditu Memorial Hospital');

insert into hospitals (name, address, latitude, longitude, radius_meters, checkin_start_time, is_active)
select 'Gandhi Memorial Hospital', 'Ras Desta Damtew St, Addis Ababa', 9.0186, 38.7524, 150, '09:00', true
where not exists (select 1 from hospitals where name = 'Gandhi Memorial Hospital');

insert into hospitals (name, address, latitude, longitude, radius_meters, checkin_start_time, is_active)
select 'Menelik II Referral Hospital', 'Russia St, Addis Ababa', 9.0385, 38.7743, 150, '09:00', true
where not exists (select 1 from hospitals where name = 'Menelik II Referral Hospital');

insert into hospitals (name, address, latitude, longitude, radius_meters, checkin_start_time, is_active)
select 'Yekatit 12 Hospital Medical College', 'Sidist Kilo, Addis Ababa', 9.0438, 38.7600, 150, '09:00', true
where not exists (select 1 from hospitals where name = 'Yekatit 12 Hospital Medical College');

insert into hospitals (name, address, latitude, longitude, radius_meters, checkin_start_time, is_active)
select 'Ras Desta Damtew Memorial Hospital', 'Arada, Addis Ababa', 9.0452, 38.7444, 150, '09:00', true
where not exists (select 1 from hospitals where name = 'Ras Desta Damtew Memorial Hospital');

insert into hospitals (name, address, latitude, longitude, radius_meters, checkin_start_time, is_active)
select 'AaBET Hospital', 'Mali St, Addis Ababa (approximate — verify against campus map)', 9.0480, 38.7290, 150, '09:00', true
where not exists (select 1 from hospitals where name = 'AaBET Hospital');

insert into hospitals (name, address, latitude, longitude, radius_meters, checkin_start_time, is_active)
select 'St. Paul''s Hospital Millennium Medical College', 'Gulele, Addis Ababa', 9.0478, 38.7281, 150, '09:00', true
where not exists (select 1 from hospitals where name = 'St. Paul''s Hospital Millennium Medical College');

insert into hospitals (name, address, latitude, longitude, radius_meters, checkin_start_time, is_active)
select 'Federal Police Hospital', '⚠ Addis Ababa — approximate placeholder, verify exact coordinates before use', 9.0100, 38.7600, 150, '09:00', true
where not exists (select 1 from hospitals where name = 'Federal Police Hospital');

insert into hospitals (name, address, latitude, longitude, radius_meters, checkin_start_time, is_active)
select 'Ethiopian Armed Forces Comprehensive Specialized Hospital', '⚠ Addis Ababa — approximate placeholder, verify exact coordinates before use', 9.0100, 38.7900, 150, '09:00', true
where not exists (select 1 from hospitals where name = 'Ethiopian Armed Forces Comprehensive Specialized Hospital');

insert into hospitals (name, address, latitude, longitude, radius_meters, checkin_start_time, is_active)
select 'ALERT Hospital', 'Zenebework, Addis Ababa', 9.0227, 38.7468, 150, '09:00', true
where not exists (select 1 from hospitals where name = 'ALERT Hospital');

-- Verification query — run after seeding:
--   select name, latitude, longitude, is_active from hospitals order by name;
-- Expect to see all pre-existing hospitals PLUS these 11 (or fewer new ones,
-- if some already existed under the same name).

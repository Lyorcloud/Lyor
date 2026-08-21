begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select is((select count(*)::integer from public.catalog_games where enabled and id in (
  'game-spider-man-2', 'game-resident-evil-4-remake', 'gta5-legacy', 'game-red-dead-redemption-2',
  'game-hell-is-us', 'game-elden-ring', 'game-spider-man-remastered', 'game-cyberpunk-2077'
)), 8, 'eight enabled production games are seeded');
select is((select display_name from public.catalog_games where id = 'game-red-dead-redemption-2'), 'Red Dead Redemption 2', 'Red Dead Redemption 2 is searchable');
select is((select display_name from public.catalog_games where id = 'gta5-legacy'), 'Grand Theft Auto V', 'Grand Theft Auto V is searchable');
select is((select display_name from public.catalog_games where id = 'game-spider-man-2'), 'Spider-Man 2', 'Spider-Man 2 is searchable');
select is((select display_name from public.catalog_games where id = 'game-resident-evil-4-remake'), 'Resident Evil 4 Remake', 'Resident Evil 4 Remake is searchable');
select is((select display_name from public.catalog_games where id = 'game-hell-is-us'), 'Hell is Us', 'Hell is Us is searchable');
select is((select display_name from public.catalog_games where id = 'game-elden-ring'), 'Elden Ring', 'Elden Ring is searchable');
select is((select display_name from public.catalog_games where id = 'game-spider-man-remastered'), 'Spider-Man Remastered', 'Spider-Man Remastered is searchable');
select is((select display_name from public.catalog_games where id = 'game-cyberpunk-2077'), 'Cyberpunk 2077', 'Cyberpunk 2077 is searchable');

select * from finish();
rollback;

# Lyor V1.2 — Milestone 3 Promptu

Lyor repository’sinde yalnızca **Milestone 3 — User Cloud / Multi-PC / Sync** işlerini uygula. Milestone 2 auth/RLS/security temelinin tamamlandığını ve testlerle geçtiğini önce doğrula. Yeni auth architecture kurma veya RLS’yi gevşetme. Installation Engine, Planaria, R2 ve updater işlerine geçme.

Önce repository talimatlarını, V1.2 belgelerini, migration’ları ve mevcut typed state/service katmanlarını incele. Var olan güvenli backend üzerinde standart CRUD/sync uygula.

Uygulanacak kapsam:

- Cloud state: theme, language, account preferences, Favorites, Cloud Library, device kayıtları ve installation summary metadata.
- Local-only state: window position, absolute game/launcher/executable path’leri, cache/staging/backup, transaction journal, file ownership ve fiziksel installed state. Absolute path veya hassas local ayrıntıları cloud’a yükleme.
- Settings sync’i local cache + cloud source-of-truth ile uygula; ilk yükleme, optimistic update, conflict ve offline davranışını tanımla.
- Favorites tablosu: `user_id`, `mod_id`, `created_at`; `(user_id, mod_id)` unique. Idempotent add/remove ve RLS testleri.
- Cloud Library: `user_id`, `mod_id`, `first_installed_at`, `last_installed_at`, `last_installed_version`, timestamps. Cloud üyeliği ile bu cihazdaki physical installed durumunu aynı alan/boolean yapma.
- Her Lyor kurulumu için random, kalıcı Device ID üret. Hardware fingerprint kullanma. Cloud’da user, device name, OS, architecture, app version, created/lastSeen metadata’sı tut.
- Device installation summary yalnızca özet olsun; local engine ileride authoritative kalacak.
- Yeni PC’de login sonrası Favorites, Cloud Library, Settings ve ownership gelsin; eski PC’deki fiziksel modlar yeni PC’de Installed görünmesin.
- Bootstrap sırası: Authenticate → Profile → Settings → Favorites → Library → Device → Device Summaries → Home. Kısmi failure tüm app’i çökertmesin.
- Network failure için kalıcı pending sync queue oluştur. Favorite/library metadata/device summary/analytics işlemleri kaybolmasın; retry/backoff ve idempotency olsun.
- Reconciliation: cloud installed iddiasına karşın local metadata yoksa local gerçeklik kazansın; local installed olup summary eksikse cloud summary düzeltilsin. Cloud Library üyeliğini yanlışlıkla silme.
- Offline: app cached account/local Library ile açılabilsin; local uninstall/backup davranışlarının cloud’a bağımlı olmayacağı contract’ı korunsun. Cloud gerektiren action’lar açık offline state göstersin.
- Logout session/token’ı temizlesin; mod, backup, game file veya local installation metadata silmesin.

Testlerde iki kullanıcı ve en az iki device senaryosu kullan. CRUD ownership/RLS, unique constraint, bootstrap partial failure, offline queue persistence, retry idempotency, reconciliation, logout data retention ve yeni cihazdaki “not installed here” davranışını doğrula. Secret çıktılama.

Lint, typecheck, build ve ilgili unit/integration/Supabase testlerini çalıştır; ortam destekliyorsa Windows packaging yap. Hataları düzeltmeden tamamlandı deme. Değişiklikleri tek açıklayıcı commit ile kaydet; push/deploy/release yapma. Son raporda cloud/local ayrımını, schema/API değişikliklerini, test sonuçlarını ve Milestone 4 öncesi blocker’ları belirt.

ÇALIŞTIRILACAK MOD:
GPT-5.6 Sol

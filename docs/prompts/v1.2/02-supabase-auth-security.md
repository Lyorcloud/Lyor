# Lyor V1.2 — Milestone 2 Promptu

Lyor repository’sinde yalnızca **Milestone 2 — Supabase Authentication + Security Foundation** işlerini uygula. Milestone 0 ve 1’in tamamlandığını kaynak kod, test ve git geçmişinden doğrula. Kurulu UI/UX’i gereksiz yere değiştirme. Installation Engine, cloud sync’in tamamı, Planaria içerik yönetimi veya R2 dağıtımı geliştirme. Milestone 3’e geçme.

Önce `AGENTS.md`, V1/V1.2 spec’leri, mevcut Electron güvenlik mimarisi ve repository’nin tamamını incele. Eski V1’in “auth/backend yok” sınırını bu milestone’un açık V1.2 yetkisi kadar güncelle. Güvenlik sınırlarını zayıflatma.

Uygulanacak temel:

- Repository içinde migration-source-of-truth yapısı kur: `supabase/migrations`, `functions`, `seed`, `tests` ve config. Manuel dashboard state’ine bağımlı production şema bırakma.
- Supabase Auth ile Register (email/password/confirm), email verification, Login, Forgot/Reset Password, session restore/refresh/expiration ve Logout akışlarını uygula.
- `auth.users` ile application `profiles` tablosunu ayır. Password veya eşdeğer secret’ı profile/database tablosunda tutma.
- Session token’larını mümkün olduğunca Windows OS-backed secure storage’da sakla. Renderer/localStorage’a uzun ömürlü hassas token bırakma. Token’ları console, analytics ve crash loglarına yazma.
- User-owned tablolar için deny-by-default RLS uygula. Profiles, Settings, Favorites, Library ve Devices erişiminde ownership’i `auth.uid() = user_id` mantığıyla enforce et. SELECT/INSERT/UPDATE/DELETE politikalarını ayrı ayrı ve migration ile tanımla.
- `user`, `admin`, ileride `super_admin` rollerini destekleyecek server-authoritative role temelini kur. Kullanıcının değiştirebildiği `user_metadata` değerine authorization için güvenme. Public signup admin üretemesin.
- Renderer/client içinde service-role key, Supabase secret, DB password, R2 secret, SMTP password veya GitHub private token bulunmasın. Yalnızca client kullanımına uygun publishable key environment template üzerinden verilsin.
- Main/preload/renderer sınırını koru. Generic IPC veya raw Node/Electron/Supabase privileged capability açma. Auth API’leri typed, narrow ve doğrulanmış olsun.
- Environment validation, sanitized error mapping, rate/abuse considerations ve auth redirect/deep-link güvenliğini ele al. Arbitrary navigation veya URL açma.

Testler gerçek güvenlik iddialarını kanıtlamalı:

- register, verification, login, wrong password, reset password, session restore/refresh, logout;
- iki ayrı normal kullanıcı arasında RLS izolasyonu;
- normal kullanıcının admin rolü kazanamaması ve admin-only kaynağa erişememesi;
- unauthenticated erişim reddi;
- migration reset/seed/test tekrar üretilebilirliği;
- secret scan ve renderer bundle incelemesi.

Gerçek production secret isteme veya repository’ye koyma. Entegrasyon ortamı/credential yoksa deterministic local Supabase test düzeni kur; çalıştırılamayan production testi geçti diye raporlama. RLS/security testlerini sadece mock ile kanıtlanmış sayma.

Son olarak lint, typecheck, build, tüm ilgili unit/integration/Supabase testlerini çalıştır. Ortam destekliyorsa Windows packaging yap. Tespit edilen security açığını bu milestone içinde düzeltmeden tamamlandı deme. Çalışan durumu açıklayıcı tek commit ile kaydet; push/deploy/release yapma. Son raporda migration’ları, trust boundary’leri, testlerin gerçek sonuçlarını, çalıştırılamayan doğrulamaları ve Milestone 3 blocker’larını yaz.

ÇALIŞTIRILACAK MOD:
GPT-5.6 Sol — Ultra

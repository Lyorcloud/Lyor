# Lyor V1.2 — Milestone 10 Promptu

Lyor repository’sinde **Milestone 10 — End-to-End Integration / Final Audit / Production Release** çalışmasını yap. Bu son milestone’da yeni feature ekleme ve mimariyi gereksiz yere yeniden yazma. Amaç bütün sistemleri birlikte denetlemek, cross-system/security/data-integrity hatalarını düzeltmek ve yalnızca bütün release gate’leri geçerse Lyor `1.2.0` production release’ini hazırlamaktır.

Önce Milestone 0–9’un commit’lerini, çıkış raporlarını, specs/migrations, mevcut git durumunu ve tüm test altyapısını incele. Eksik milestone’u tamamlanmış varsayma. Kullanıcı değişikliklerini koru. Production secret veya kullanıcı verisini çıktılama.

Audit ve E2E matrisi:

1. Authentication/security: register, verify, login, wrong password, reset, session refresh/restore, logout, RLS, iki kullanıcı izolasyonu, admin escalation denemesi, secret/token isolation.
2. Multi-PC/sync: yeni device registration, Settings/Favorites/Cloud Library, account-vs-local state, local physical installation ayrımı, reconciliation, offline boot, pending queue idempotency ve logout data retention.
3. UI: traffic lights, Lyor/Planaria switcher authorization, Ice Max/Dark/Light ve no-flash, Search/Billboard focus, image/video carousel/duration/fallback, sorting, Library states, install success/error animation, accessibility ve reduced motion.
4. Installation Engine: detection, stable Game ID/edition/version, manifest validation, add/replace/backup/restore, ownership, transaction/rollback, crash recovery, integrity/tamper, conflict/dependency, permission elevation, path/symlink security ve sanitized logs.
5. Advanced adapter: seçilmiş gerçek ve yetkili oyun/mod testi mümkünse `Download → Manifest → Archive Adapter → Transaction → Install → Uninstall → byte-for-byte Original State`. Gerçek materyal/tooling yoksa fixture sonucunu production gerçek-oyun testi diye sunma; release blocker olarak değerlendir.
6. Planaria/backend: normal user blocked, admin allowed, server authorization, mod/version/package/manifest/hash lifecycle, Draft/Ready/Published immutability ve concurrent operation güvenliği.
7. Object storage: presigned multipart direct upload, resume/retry, object verification, immutable versions, short-lived signed download, URL expiry, unauthorized access block ve orphan cleanup.
8. Billboard: image/video, real duration, preview parity, deterministic ordering, Draft/Published/Disabled, atomic publish ve Home integration/fallback.
9. Analytics: download_requested/started/completed/failed, install_completed ve favorite event validation/idempotency. Most Downloaded yalnızca güvenilir completed download verisini kullansın.
10. Email: production verification/reset, custom SMTP, doğru sender domain ve backend-only secrets. Gerçek delivery testi yoksa blocker olarak raporla.
11. Updater: gerçek eski packaged build → yeni release → update found → user-approved download → restart/install → new version. Failure, offline, corrupt metadata, hash/signature, downgrade ve loop prevention.

Production gate’leri:

- Clean install ve clean Windows test ortamı.
- Windows 10 22H2 x64 ve Windows 11 x64; ARM64 açık bir V1.2 hedefi olarak yapılandırılmışsa ayrıca ARM64. Desteklenmeyen platform için sahte başarı yazma.
- Production env/config, migrations, SMTP, storage, auth ve release target doğrulaması.
- Test credential/object/feature flag kalıntısı, secret, kritik renderer/main/backend error’ı olmaması.
- `npm run lint`, `npm run typecheck`, tüm unit/integration/security/E2E testleri, `npm run build`, `npm run dist:win` başarılı.
- Installer, unpacked EXE, `latest.yml`, blockmap ve updater metadata tutarlı.
- Trusted Windows code signing ve artifact integrity doğrulaması. İmzalama production gereksinimiyse unsigned artifact’i release etme.
- Version `1.2.0`, tag, GitHub Release ve updater metadata birebir uyumlu.
- Database/backend rollout sırası eski client’ları kırmıyor.

Audit sırasında bulduğun yalnızca release’i engelleyen veya mevcut milestone sözleşmesini ihlal eden hataları düzelt. Yeni ürün fikri ekleme. Her düzeltmeden sonra ilgili dar testleri, ardından tüm release suite’i yeniden çalıştır.

Public production publish, tag/push, production migration veya external storage mutation geri döndürmesi zor işlemlerdir. Bu prompt çalıştırıldığında kullanıcı bunları açıkça yetkilendirmediyse önce tüm local/release-candidate gate’lerini tamamla, exact yayın planı ve artifact hash’leriyle onay iste. Açık yetki varsa bile target repository/environment/version’ı read-only kontrollerle doğrulamadan yayınlama. Herhangi bir kritik gate başarısızsa **release yapma**.

Bütün gate’ler geçerse **Lyor 1.2.0 Production Release / Lyor Setup V1.2** artifact’ini oluştur, yetki kapsamında GitHub Release/updater kanalına yayımla ve eski-build update testini tamamla. Release commit/tag temiz ve izlenebilir olsun.

Son raporda pass/fail matrisi, düzeltilen kritik bulgular, çalıştırılan gerçek komutlar, exact artifact/release URL’leri ve SHA-256 hash’leri, signing durumu, migration/deploy sırası, update testi ve kalan blocker’ları yaz. Test edilmemiş bir şeyi geçti diye sunma. Release yapılmadıysa nedenini ve tamamlamak için gereken tek sonraki adımı açıkla.

ÇALIŞTIRILACAK MOD:
GPT-5.6 Sol — Ultra

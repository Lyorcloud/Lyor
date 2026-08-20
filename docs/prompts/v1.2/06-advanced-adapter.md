# Lyor V1.2 — Milestone 6 Promptu

Lyor repository’sinde yalnızca **Milestone 6 — Advanced Game Adapter Architecture** işlerini uygula. Milestone 4 ve 5’in engine, transaction, rollback, recovery ve path-security testlerini geçtiğini doğrulamadan başlama. Bütün oyunları desteklemeye çalışma. Planaria/backend/R2 veya release işine geçme.

Önce mevcut GenericFileAdapter, manifest resolver, transaction manager, ownership/integrity metadata’sı ve güvenlik testlerini incele. Yeni adapter mevcut güvenlik/transaction katmanını bypass edemez.

Uygulanacak kapsam:

- Açık capability-based adapter contract: file operations, archive operations, mod layer, config merge, version detection ve validation.
- Archive Handler API: open, inspect, read, add, replace, delete, backup, verify. Resource lifecycle ve error model typed olsun.
- Manifest’e versioned `ARCHIVE_ADD`, `ARCHIVE_REPLACE`, `ARCHIVE_DELETE`, `CONFIG_MERGE` operasyonlarını ekle. Eski schema/manifest compatibility veya açık migration hatası tanımla.
- Oyun destekliyorsa original game file yerine Lyor-owned mod layer yaklaşımını tercih et. Replace + verified backup yalnızca ikinci seçenek olsun.
- Yalnızca **bir** açıkça seçilmiş gerçek oyun + gerçek, yasal/test edilebilir mod senaryosu için ilk adapter’ı uygula. Seçimi repository bağlamı ve mevcut fixture’lara göre yap; kullanıcı verisine zarar verecek canlı test yapma. Gerekli proprietary/RPF tooling, lisans veya gerçek test materyali yoksa güvenli adapter contract + synthetic container fixture tamamla ve production-ready gerçek adapter iddiasında bulunma.
- Archive/container içi entry path validation, duplicate/case collision, compression/resource limit, corrupted archive, version mismatch, locked file, insufficient disk, atomic replacement, backup ve verify davranışlarını uygula.
- Config merge yalnızca format-aware, deterministic, schema doğrulamalı ve rollback edilebilir olsun; bilinmeyen text/binary üzerinde otomatik merge yapma.
- Adapter operasyonları Milestone 5 journal/transaction/rollback/crash recovery’sine aynı invariant’larla katılsın.

Çıkış senaryosu kontrollü fixture’da şu zinciri kanıtlamalı:

`Download → Manifest → Adapter → Transaction → Install → Verify → Uninstall → byte-for-byte Original State`

Başarılı akışa ek olarak corrupted archive, malicious entry path, wrong game/edition/version, unsupported capability, mid-archive crash, verify mismatch, config conflict ve rollback testleri çalışmalı. Security fuzz/property testleri uygunsa ekle.

Gerçek bir oyun/mod üzerinde güvenli ve yetkili test koşulları yoksa bunu blocker olarak açıkça raporla; fixture testini “gerçek oyun production doğrulaması” diye sunma. Arbitrary installer/script çalıştırma.

Lint, typecheck, build, adapter/engine/security testleri ve mümkünse Windows packaging’i çalıştır. Hataları düzeltmeden tamamlandı deme. Çalışan durumu açıklayıcı tek commit ile kaydet; push/release yapma. Son raporda desteklenen capability’leri, seçilen adapter/fixture’ı, lisans/tooling sınırlamalarını, recovery sonuçlarını ve Milestone 7 blocker’larını yaz.

ÇALIŞTIRILACAK MOD:
GPT-5.6 Sol — Ultra

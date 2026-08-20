# Lyor V1.2 — Milestone 4 Promptu

Lyor repository’sinde yalnızca **Milestone 4 — Installation Engine Core** işlerini uygula. Milestone 0–3’ün tamamlandığını ve çalışma ağacının güvenli durumunu doğrula. Bu milestone, daha önceki “gerçek game file erişimi yok” yasağını yalnızca kontrollü test fixture’ları ve açıkça desteklenen normal filesystem modları için kaldırır. Advanced archive/RPF/container, production object storage, Planaria ve Milestone 5 güvenlik/transaction genişletmelerine geçme.

Önce `AGENTS.md`, V1/V1.2 spec’leri, Electron main/preload/renderer sınırları ve mevcut mock install service’i incele. V1.2 kaynak-of-truth belgelerini bu milestone’un dar yetkisiyle güncelle. Mock service’i bir anda presentation içine gömülü gerçek filesystem koduyla değiştirme; gerçek engine ayrı, typed ve test edilebilir bir privileged katmanda olsun.

Hedef mimari:

`UI → typed Install Request → Download/Package input boundary → Installation Engine → Manifest Resolver → GenericFileAdapter → Transaction boundary → Filesystem`

Uygulanacak kapsam:

- Renderer filesystem’e erişmesin. Main process/ayrı privileged service yalnızca narrow typed ve doğrulanmış IPC kullanabilsin. Generic channel/path/command kabul etme.
- Game detection için Steam, Epic, Rockstar, Xbox PC ve Manual provider contract’ları oluştur. Sonuç modeli Game ID, root, store, executable, edition ve version içersin. Bu milestone’da yalnızca doğrulanabilen detection’ları uygula; tahmin edilen path’i gerçekmiş gibi gösterme.
- `gta5-legacy` ve `gta5-enhanced` gibi edition-aware stable Game ID modeli kur. Manifest/game edition uyuşmazlığında install’ı engelle.
- Versioned Installation Manifest şeması oluştur: schema version, mod/version, game/edition/version range, sources, targets, yalnızca relative paths, operations, dependencies/conflicts metadata’sı, adapter, checksums ve installed size.
- İlk gerçek operasyonlar: `COPY_FILE`, `COPY_FOLDER`, `REPLACE_FILE`, `DELETE_FILE`, `CREATE_DIRECTORY`. Archive operasyonu veya arbitrary script/process execution ekleme.
- `GenericFileAdapter`: güvenli copy, recursive folder copy, replace, backup ve restore davranışları.
- Local metadata: installed mod/version, Game ID/edition, file ownership, original-file backup ilişkisi ve uygulanan operation kayıtları. Şeması versioned ve atomik güncellenebilir olsun.
- Safe uninstall core: Lyor’un eklediği owned file kaldırılır; replaced file’ın doğrulanmış original backup’ı geri konur. Rastgele klasör veya manifest dışında path silme.
- `already installed`, `update available`, `reinstall required` durumlarını ayrı modelle.

Bu milestone’un gerçek game kurulumuna zarar vermemesi zorunludur. Test için repository altında veya geçici klasörde sentetik game fixture ve örnek normal filesystem package/manifest kullan. Kullanıcının gerçek GTA V/RPF klasörünü otomatik keşfetme, okuma veya değiştirme. Manual path testi de fixture ile yapılmalı.

Güvenlik minimumları Milestone 5’i beklemeden korunmalı: canonical path containment, traversal/absolute path reddi, symlink/reparse-point kaçışı kontrolü, allow-list operation parsing, schema validation ve typed errors. Remote manifest BAT/CMD/PS1/EXE çalıştıramaz.

Çıkış testi fixture üzerinde tam olarak şunu kanıtlamalı:

`Install → Add → Replace → Backup → Verify → Uninstall → byte-for-byte Original State`

Ayrıca yanlış edition, invalid schema, duplicate/reinstall state, ownership dışı uninstall, traversal ve interrupted operation öncesi güvenli failure testleri ekle. Milestone 5’in tam journal/rollback/resume sistemini burada spekülatif biçimde kurma; interface sınırlarını hazır bırak.

Lint, typecheck, build ve tüm engine testlerini çalıştır. Test fixture’larının başlangıç/son hash’lerini doğrula. Ortam destekliyorsa Windows packaging yap. Gerçek game path’ine dokunulmadığını kanıtlayan rapor ver. Hataları düzelt, çalışan durumu açıklayıcı tek commit ile kaydet; push/release yapma. Son raporda engine sınırlarını, manifest/metadata şemasını, test sonuçlarını ve Milestone 5 blocker’larını yaz.

ÇALIŞTIRILACAK MOD:
GPT-5.6 Sol — Ultra

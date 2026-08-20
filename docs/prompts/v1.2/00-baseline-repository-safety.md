# Lyor V1.2 — Milestone 0 Promptu

Lyor repository’sinde yalnızca **Milestone 0 — V1.2 Baseline / Repository Safety** üzerinde çalış. Bu bir özellik geliştirme milestone’u değildir. Milestone 1’e veya sonraki işlere geçme.

Önce repository kökündeki `AGENTS.md`, `docs/LYOR_V1_SPEC.md`, `README.md`, `package.json`, release belgeleri ve mevcut kaynak kodu tamamen incele. Kullanıcının mevcut değişikliklerini koru; dirty worktree varsa ilgisiz dosyaları değiştirme veya geri alma. Mevcut çalışan sistemleri gereksiz yere yeniden yazma.

Amaç:

- Mevcut `0.1.0`–`0.1.3` sürümlerini geliştirme/prototip sürümleri olarak kabul eden güvenli bir V1.2 çalışma tabanı oluştur.
- Yeni production sürüm hattını `1.2.0`, ardından `1.2.1`, `1.2.2` şeklinde tanımla.
- Kullanıcıya verilecek temel kurulum adını **Lyor Setup V1.2** olarak belgelemeye hazırla.
- Mevcut Electron main/preload/renderer ayrımını, güvenlik sınırlarını, development/production config ayrımını ve updater/release kurulumunu denetle.
- V1.2 geliştirmesi için `codex/` önekli güvenli bir branch oluştur; branch oluşturma mümkün değilse sebebi açıkça raporla. Kullanıcının açık talebi olmadan remote’a push yapma.
- Mevcut uygulamanın çalışır durumunu doğrula.

Repository kaynak-of-truth sözleşmesini kur veya belgele. Aşağıdakiler ilerleyen milestone’larda manuel dashboard ayarları yerine version control altında tutulacak:

- database migrations/schema ve RLS policies;
- Supabase/Edge/backend functions;
- seed ve backend testleri;
- storage entegrasyonu;
- environment template’leri (secret içermeden);
- GitHub workflows ve application config;
- Installation Manifest şeması ve adapter interface’leri.

V1.2’nin dört teknik katmanını birbirinden ayıran mimari sözleşmeyi belgeleyip mevcut yapıyla karşılaştır:

1. Lyor Cloud Platform — Supabase auth, metadata ve account-level state.
2. Lyor Mod Distribution Cloud — provider bağımsız object storage/CDN; ilk production provider daha sonra Cloudflare R2 olabilir.
3. Lyor Local Installation Engine — cihazdaki game path, backup, journal, cache, staging, ownership ve fiziksel kurulum gerçekliği.
4. Lyor Application Distribution — GitHub source/actions/releases, Setup ve updater metadata.

Supabase Database’e büyük binary konulmayacağını; ZIP/7Z/RAR ve multi-GB paketlerin object storage’da, database’de yalnızca provider/object key/size/SHA-256/publish state gibi metadata’nın tutulacağını belirt. Cloud account state ile cihazdaki local/physical state’in kesin ayrımını belgele.

Mevcut `docs/LYOR_V1_SPEC.md` ve `AGENTS.md` V1.2 planıyla çelişiyorsa bu milestone’da gerçek backend veya engine kodu ekleme. Bunun yerine V1.2 kapsam değişikliğini açık, kontrollü ve gelecekte milestone bazında etkinleşecek şekilde proje belleğine işle; eski foundation durumunu ve halen yürürlükte olan güvenlik yasaklarını yanlışlıkla kaldırma. Her sonraki milestone yalnızca açıkça yetkilendirdiği sınırı açmalıdır.

Doğrulama:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Uygun ve güvenliyse mevcut testler
- Ortam destekliyorsa `npm run dist:win`; üretilen installer/EXE’nin tam yolunu raporla.

Tüm kontroller başarılı olmadan tamamlandı deme. Hata varsa kök nedeni bul ve yalnızca milestone kapsamındaki düzeltmeleri yap. Secret veya gerçek credential ekleme/çıktılama. Çalışan durumu milestone’a özel net bir commit ile kaydet; commit mümkün değilse sebebini bildir. Push veya release yapma.

Son raporda değişen ana dosyaları, mimari/baseline bulgularını, çalıştırılan her komutun gerçek sonucunu, artifact yolunu ve Milestone 1 öncesi kalan blocker’ları yaz.

ÇALIŞTIRILACAK MOD:
GPT-5.6 Sol

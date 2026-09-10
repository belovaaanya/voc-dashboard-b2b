/*
  Слой загрузки данных. Единственный модуль, который ходит в сеть.

  Контракт — docs/data-model.md §7. Держится тонким намеренно: контракт может
  уточнить сессия data pipeline, и тогда правка затрагивает только этот файл.
*/

const DATA_DIR = 'data/';
const FIXTURE_DIR = 'fixture/';

export const SOURCE_DATA = 'data';
export const SOURCE_FIXTURE = 'fixture';

async function fetchJson(url, cache) {
  const response = await fetch(url, { cache });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

/*
  Расхождение с контрактом обязано падать здесь и с указанием файла: тихо
  подставленный пустой массив выглядел бы как «нет данных за период»
*/
function assertManifest(manifest, url) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error(`${url}: манифест не является объектом`);
  }
  if (!manifest.files || typeof manifest.files.ratings !== 'string') {
    throw new Error(`${url}: в манифесте нет files.ratings`);
  }
  return manifest;
}

async function loadManifestFrom(dir) {
  const url = `${dir}manifest.json`;
  /* Манифест не кэшируется, имена файлов внутри него несут хэш содержимого (D-36) */
  return assertManifest(await fetchJson(url, 'no-store'), url);
}

/*
  Порядок источников: сначала настоящие данные, при их отсутствии — фикстура.
  Fallback обязан быть видимым, поэтому вызывающий получает и source, и причину.
*/
export async function loadSource() {
  try {
    return { source: SOURCE_DATA, dir: DATA_DIR, manifest: await loadManifestFrom(DATA_DIR) };
  } catch (dataError) {
    const manifest = await loadManifestFrom(FIXTURE_DIR).catch((fixtureError) => {
      throw new Error(
        `данные недоступны: ${DATA_DIR} — ${dataError.message}; ${FIXTURE_DIR} — ${fixtureError.message}`,
      );
    });
    return { source: SOURCE_FIXTURE, dir: FIXTURE_DIR, manifest, dataError };
  }
}

function fileUrl(source, kind) {
  const name = source.manifest.files?.[kind];
  if (typeof name !== 'string') {
    throw new Error(`в манифесте нет files.${kind}`);
  }
  return source.dir + name;
}

export function loadRatings(source) {
  return fetchJson(fileUrl(source, 'ratings'), 'default');
}

/* Тексты грузятся по требованию, а не при открытии страницы (data-model §7) */
export function loadVerbatim(source) {
  return fetchJson(fileUrl(source, 'verbatim'), 'default');
}

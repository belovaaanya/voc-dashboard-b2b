/*
  Слой загрузки данных. Единственный модуль, который ходит в сеть.

  Контракт — docs/data-model.md §7. Держится тонким намеренно: контракт
  уточняется сессией data pipeline, и правка затрагивает только этот файл.
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
  if (!Array.isArray(manifest.files)) {
    throw new Error(`${url}: в манифесте нет массива files`);
  }
  if (!manifest.files.some((file) => file?.role === 'ratings')) {
    throw new Error(`${url}: в files нет записи с role "ratings"`);
  }
  return manifest;
}

async function loadManifestFrom(dir) {
  const url = `${dir}manifest.json`;
  /*
    Заголовки кэширования на Pages не настраиваются, поэтому «не кэшировать
    манифест» из D-36 обеспечивает страница: иначе браузер отдаст старый
    манифест и запросит по нему уже удалённые конвертером файлы
  */
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

/* Имя файла несёт хэш содержимого, поэтому берётся из манифеста по role (D-36) */
function fileUrl(source, role) {
  const entry = source.manifest.files.find((file) => file?.role === role);
  if (typeof entry?.name !== 'string') {
    throw new Error(`в манифесте нет файла с role "${role}"`);
  }
  return source.dir + entry.name;
}

export function hasRole(source, role) {
  return source.manifest.files.some((file) => file?.role === role);
}

export function loadRatings(source) {
  return fetchJson(fileUrl(source, 'ratings'), 'default');
}

/* Справочник: подписи, join триггер → КП/продукт, плановые коридоры */
export function loadReference(source) {
  return fetchJson(fileUrl(source, 'reference'), 'default');
}

/* Тексты грузятся по требованию, а не при открытии страницы (data-model §7) */
export function loadVerbatim(source) {
  return fetchJson(fileUrl(source, 'verbatim'), 'default');
}

import { existsSync, readFileSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

export function loadJsonFile<T>(fpath: string): Promise<T> {
  return new Promise(async (_resolve, _reject) => {
    if (!existsSync(fpath)) {
      _reject(`fs existsSync returned false for ${fpath}`);
      return;
    }

    let str: string;
    try {
      str = readFileSync(fpath, "utf-8");
    } catch (ex) {
      _reject(ex);
      return;
    }
    let json: T;
    try {
      json = JSON.parse(str);
    } catch (ex) {
      _reject(ex);
      return;
    }
    _resolve(json);
  });
}


function overrideJson<T>(src: T, dest: T) {
  let keys = Object.keys(src);
  for (let key of keys) {
    dest[key] = src[key];
  }
}


export const __filename = fileURLToPath(import.meta.url);
export const __dirname = dirname(__filename);
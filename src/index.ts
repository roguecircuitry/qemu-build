
import { execSync } from "child_process";
import { existsSync, fstat, readFileSync } from "fs";
import { resolve as resolvePath, dirname, isAbsolute as isAbsolutePath } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ConfigPaths {
  "qemu": {
    /**Path to default qemu-img
     * ex: Windows "C:\Program Files\qemu\qemu-img.exe"
     * ex: Linux home dir of current user "~/qemu/qemu-img"
    */
    "qemu-img": string,
    /**Path to default qemu-build system binary
     * ex: Windows: "C:\Program Files\qemu\qemu-system-x86_64.exe"
     * ex: Linux home dir of current user: "~/qemu/qemu-system-x86_64"
     * 
     * This is only one system per image, and this can be overridden in your image.json the same way as in global.config.json
     */
    "qemu-system": string
  }
}

export interface ConfigJson {
  "paths": ConfigPaths;
}

export enum TaskType {
  disk_create
}

export interface Task {
  type: TaskType;
}

export type ImageCommandFailure = "warn" | "abort" | "retry";
export interface ImageCommand {
  data: string;
  failure?: ImageCommandFailure;
  maxRetries?: number;
}

export type ImageId = string;
export interface ImageJson extends Partial<ConfigJson> {
  /**should be utilized by a top-post image parent, selects the ISO to install on this image*/
  iso?: string;

  kvm?: boolean;

  globalAccessableId?: string;

  /**ID of this image, used relatively from its parent chain ids. Should only include the name of this child image*/
  id: ImageId;

  /**Define child images here for 'forking' of this image*/
  children?: Array<ImageJson>;

  /**Commands to run when creating this image. Runs on the virtual machine after booting.*/
  commands?: Array<ImageCommand>;
}

export class Image {
  paths: ConfigPaths;
  iso?: string;
  kvm?: boolean;

  parent: Image | undefined;

  globalAccessableId: string | undefined;
  id: ImageId;
  children: Map<ImageId, Image>;

  commands: Array<ImageCommand>;

  private constructor(json: ImageJson, globalConfig: ConfigJson) {
    if (!json.paths) {
      this.paths = globalConfig.paths;
    } else {
      this.paths = json.paths;
    }

    if (json.iso) this.iso = json.iso;

    this.kvm = json.kvm === true;

    if (json.globalAccessableId) this.globalAccessableId = json.globalAccessableId;
    this.id = json.id;
    this.children = new Map();

    if (json.commands) this.commands = json.commands;

    if (json.children) {
      for (let i = 0; i < json.children.length; i++) {
        let child = json.children[i];

        let childImage = Image.from(child, globalConfig);
        childImage.parent = this;

        this.children.set(child.id, childImage);
      }
    }
  }
  static from(json: ImageJson, globalConfig: ConfigJson): Image {
    return new Image(json, globalConfig);
  }
  resolveFileName(): string {
    return `${this.id}.qcow`;
  }
  static load (fpath: string, globalConfig: ConfigJson): Promise<Image> {
    return new Promise(async (_resolve, _reject)=>{
      let json: ImageJson;
      try {
        json = await loadJsonFile<ImageJson>(fpath);
      } catch (ex) {
        _reject(ex);
        return;
      }
      _resolve(Image.from(json, globalConfig));
      return;
    });
  }
  build (dry: boolean = true) {
    let size = 1;
    console.log(this.paths);
    
    let diskFileName = this.resolveFileName();

    let diskCreateCmd = `"${this.paths.qemu["qemu-img"]}" create -f qcow2 ${diskFileName} ${size}G`;
    console.log("Running", diskCreateCmd);

    if (!dry) {
      try {
        execSync(diskCreateCmd);
      } catch (ex) {
        console.error("failed to create disk", ex);
        return;
      }
    }

    if (this.iso) {
      let isoFilePath: string;
      if (isAbsolutePath(this.iso)) {
        isoFilePath = this.iso;
      } else {
        isoFilePath = resolvePath(__dirname, "..", this.iso);
      }

      let bootInstallCmd = `"${this.paths.qemu["qemu-system"]}" `;
      if (this.kvm) bootInstallCmd += "-enable-kvm -cpu host ";
      bootInstallCmd +=
      "-boot menu=on " +
      "-boot order=d " +
      `-cdrom ${isoFilePath} ` +
      `-drive file=${diskFileName},format=qcow2 ` +
      "-m 2G " +
      "-nic user,hostfwd=tcp::10022-:22";

      console.log("Running", bootInstallCmd);
      if (!dry) {
        try {
          execSync(bootInstallCmd);
        } catch (ex) {
          console.error("failed to run iso install", ex);
          return;
        }
      }
    }
  }
}

export const Tasks = {
  EXEC_QEMU_IMG: "qemu-img",
  EXEC_QEMU_SYSTEM: "qemu-system-x86_64",

  state: {
    diskFilename: ""
  },

  _create_disk(diskFileName: string = "disk.qcow") {
    return `${Tasks.EXEC_QEMU_IMG} create -f qcow2 ${diskFileName}`;
  },

  begin(diskFileName: string = "disk.qcow") {
    Tasks.state.diskFilename = diskFileName;
    Tasks._create_disk(diskFileName);
  },


  install(isoFileName: string) {
    return `${Tasks.EXEC_QEMU_SYSTEM} \
    -enable-kvm \
    -cpu host \
    -boot menu=on \
    -boot order=d \
    -cdrom ${isoFileName} \
    -drive file=${Tasks.state.diskFilename},format=qcow2 \
    -m 2G \
    -nic user,hostfwd=tcp::10022-:22`
  },

  fork() {
    return `${Tasks.EXEC_QEMU_IMG} create -f qcow2 -b ${Tasks.state.diskFilename} disk-snapshot.qcow`;
  },

  boot() {
    return `${Tasks.EXEC_QEMU_SYSTEM} \
    -enable-kvm \
    -cpu host \
    -boot menu=on \
    -boot order=d \
    -drive file=disk-snapshot.qcow,format=qcow2 \
    -m 2G \
    -curses \
    -net user,hostfwd=tcp::10022-:22 \
    -net nic`;
  }

};

function loadJsonFile<T>(fpath: string): Promise<T> {
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

function overrideJson<T> (src: T, dest: T) {
  let keys = Object.keys(src);
  for (let key of keys) {
    dest[key] = src[key];
  }
}

async function main(argv: string[]) {

  let globalConfig = await loadJsonFile<ConfigJson>("./global.config.json");

  // console.log(globalConfig);

  let defFileName: string = undefined;

  let dryRun: boolean = false;

  for (let args of argv) {
    if (!args.startsWith("-")) continue;

    args = args.substring(1);

    let [key, value] = args.split("=");
    switch (key) {
      case "def":
        defFileName = value;
        break;
      case "dry":
        dryRun = (value === "true" || value === "1" || value === undefined);
        // console.log("dry", dryRun);
      default:
        break;
    }

  }

  let defFilePath: string;

  if (isAbsolutePath(defFileName)) {
    defFilePath = defFileName;
    console.log(`ImageJson file name: ${defFileName} , is absolute path, using as is`);
  } else {
    defFilePath = resolvePath(__dirname, "..", defFileName);
    console.log(`ImageJson file name: ${defFileName} , resolved to: ${defFilePath}`);
  }
  
  let img = await Image.load(defFilePath, globalConfig);

  console.log("Image definition processed", img);

  if (dryRun) {
    console.log("building image in dry run mode, no commands will execute, only display");
  } else {
    console.log("building image, this will execute qemu binaries and may take some time.");
  }
  img.build(dryRun);

  console.log("Finished");
}
main(process.argv);

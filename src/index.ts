
import { isAbsolute as isAbsolutePath, resolve as resolvePath } from "path";
import { ConfigJson } from "./config.js";
import { Image } from "./image.js";
import { loadJsonFile } from "./utils.js";
import { __dirname } from "./utils.js";

export enum TaskType {
  disk_create
}

export interface Task {
  type: TaskType;
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

async function main(argv: string[]) {

  let globalConfig = await loadJsonFile<ConfigJson>("./global.config.json");

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

  // console.log("Image definition processed", img);

  if (dryRun) {
    console.log("building image in dry run mode, no commands will execute, only display");
  } else {
    console.log("building image, this will execute qemu binaries and may take some time.");
  }
  img.build(dryRun);

  console.log("Finished");
}
main(process.argv);

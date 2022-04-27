
export enum TaskType {
  disk_create
}

export interface Task {
  type: TaskType;
}

export type ImageCommandFailure = "warn"|"abort"|"retry";
export interface ImageCommand {
  data: string;
  failure?: ImageCommandFailure;
}

export type ImageId = string;
export interface ImageJson {
  globalAccessableId?: string;
  id: ImageId;
  children?: Array<ImageJson>;
  commands?: Array<ImageCommand>;
}

async function main () {
  let imgJson: ImageJson = {
    id: "arch-linux",
    children: [
      {
        id: "arch-linux-deps",
        commands: [
          {
            data: "sudo pacman -S nodejs git",
            failure: "abort"
          }
        ],
        children: [{
          id: "arch-linux-server",
          commands: [{
            data: "git clone https://github.com/roguecircuitry/qemu-build"
          }]
        }]
      }
    ]
  };

  build(imgJson);
}
main();

export class Image {
  parent: Image|undefined;

  globalAccessableId: string|undefined;
  id: ImageId;
  children: Map<ImageId, Image>;

  commands: Array<ImageCommand>;

  private constructor (json: ImageJson) {
    if (json.globalAccessableId) this.globalAccessableId = json.globalAccessableId;
    this.id = json.id;
    this.children = new Map();

    if (json.commands) this.commands = json.commands;

    for (let i=0; i<json.children.length; i++) {
      let child = json.children[i];
      
      let childImage = Image.from(child);
      childImage.parent = this;

      this.children.set(child.id, childImage);
    }
  }
  static from (json: ImageJson): Image {
    return new Image(json);
  }
  resolveFileName (): string {
    return `${this.id}.qcow`;
  }
}

export function build (imgJson: ImageJson): Image {
  return Image.from(imgJson);
}

export const Tasks = {
  EXEC_QEMU_IMG: "qemu-img",
  EXEC_QEMU_SYSTEM: "qemu-system-x86_64",

  state: {
    diskFilename: ""
  },

  _create_disk (diskFileName: string = "disk.qcow") {
    return `${Tasks.EXEC_QEMU_IMG} create -f qcow2 ${diskFileName}`;
  },

  begin (diskFileName: string = "disk.qcow") {
    Tasks.state.diskFilename = diskFileName;
    Tasks._create_disk(diskFileName);
  },


  install (isoFileName: string) {
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

  fork () {
    return `${Tasks.EXEC_QEMU_IMG} create -f qcow2 -b ${Tasks.state.diskFilename} disk-snapshot.qcow`;
  },

  boot () {
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

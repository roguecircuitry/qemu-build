
import { execSync, spawn } from "child_process";
import { existsSync as fsExistsSync } from "fs";
import { NodeSSH } from "node-ssh";
import { isAbsolute as isAbsolutePath, resolve as resolvePath } from "path";
import { ConfigAuthJson, ConfigJson, ConfigPathsJson } from "./config.js";
import { loadJsonFile } from "./utils.js";
import { __dirname } from "./utils.js";


export type ImageCommandFailure = "warn" | "abort" | "retry";
export interface ImageCommand {
  data: string;
  failure?: ImageCommandFailure;
  maxRetries?: number;
}

export type PortProtocol = "tcp"|"udp";

export interface PortForwardRule {
  hostPort: number;
  vmPort: number;
  type: PortProtocol;
}

export type ImageId = string;
export interface ImageJson extends Partial<ConfigJson> {
  /**should be utilized by a top-post image parent, selects the ISO to install on this image*/
  iso?: string;

  kvm?: boolean;

  portForward?: Array<PortForwardRule>;

  /**When image is created, the total hard drive size will be initSizeGB gigabytes */
  initSizeGB?: number;

  /**During run of VM, the alloted max RAM will be memoryGB gigabytes*/
  memoryGB?: number;

  globalAccessableId?: string;

  /**ID of this image, used relatively from its parent chain ids. Should only include the name of this child image*/
  id: ImageId;

  /**Define child images here for 'forking' of this image*/
  children?: Array<ImageJson>;

  /**Commands to run when creating this image. Runs on the virtual machine after booting.*/
  commands?: Array<ImageCommand>;
}

export class Image {
  paths: ConfigPathsJson;
  iso?: string;
  auth?: ConfigAuthJson;
  kvm?: boolean;
  portForward?: Array<PortForwardRule>;
  initSizeGB?: number;
  memoryGB?: number;

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

    if (json.auth) this.auth = json.auth; //TODO: inherit auth from parent if not overriden by child

    this.kvm = json.kvm === true;

    if (json.portForward) this.portForward = json.portForward;

    if (json.initSizeGB) {
      this.initSizeGB = json.initSizeGB;
    } else {
      this.initSizeGB = 1;
    }
    if (json.memoryGB) {
      this.memoryGB = json.memoryGB;
    } else {
      this.memoryGB = 2;
    }

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
  static load(fpath: string, globalConfig: ConfigJson): Promise<Image> {
    return new Promise(async (_resolve, _reject) => {
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
  static boot(image: Image, install: boolean = false, cli: boolean = false, dry: boolean = true) {

    let diskFileName = image.resolveFileName();

    let isoFilePath = image.iso;
    if (!isAbsolutePath(image.iso)) {
      isoFilePath = resolvePath(__dirname, "..", image.iso);
    }

    if (!fsExistsSync(isoFilePath) && install && !dry) {
      console.error(`ISO specified by image: "${image.iso}" (resolved to "${isoFilePath}" ) was not found, but install was desired. Not sending command to qemu, as it fail end up failing.`);
      return;
    }

    let cmd = `"${image.paths.qemu["qemu-system"]}" `;

    if (image.kvm) cmd += "-enable-kvm -cpu host ";

    cmd += "-boot menu=on -boot order=d ";

    if (install) cmd += `-cdrom ${isoFilePath} `;

    cmd += `-drive file=${diskFileName},format=qcow2 `;

    cmd += `-m ${image.memoryGB}G `;

    // "-net user,hostfwd=tcp::3389-:3389,hostfwd=tcp::443-:443,hostfwd=tcp::992-:992";
    if (image.portForward) {
      cmd += "-nic user";
      for (let rule of image.portForward) {
        cmd += `,hostfwd=${rule.type}::${rule.hostPort}-:${rule.vmPort}`;
      }
      cmd += " -net nic ";
    }
    if (cli) cmd += "-display curses "; //TODO: this doesn't seem to work in qemu well..

    console.log("Running", cmd);
    if (!dry) {
      execSync(cmd);
    }
  }
  static create_disk (image: Image, dry: boolean = true) {
    let diskFileName = image.resolveFileName();
  
    let diskCreateCmd = `"${image.paths.qemu["qemu-img"]}" create -f qcow2 ${diskFileName} ${image.initSizeGB}G`;
    console.log("Running", diskCreateCmd);

    if (!dry) {
      if (fsExistsSync(diskFileName)) {
        console.log(`Disk ${diskFileName} already exists, skipping`);
      } else {
        try {
          execSync(diskCreateCmd);
        } catch (ex) {
          console.error("failed to create disk", ex);
          return;
        }
      }
    }
  }
  build(dry: boolean = true) {
    Image.create_disk(this, dry);

    //TODO: detect image needs installation somehow
    let needsInstalled = true;
    Image.boot(this, this.iso && needsInstalled, false, dry);
    
    // if (this.commands) {
    //   if (!dry) {
    //     let ssh = new NodeSSH();

    //     let password: string;
    //     let username: string;
    //     if (this.auth.required) {
    //       password = this.auth.password;
    //       username = this.auth.user;
    //     }

    //     ssh.connect({
    //       host: "localhost",

    //       //undefined when !auth.required
    //       username: this.auth.user,
    //       password: this.auth.password

    //     }).then(() => {
    //       for (let command of this.commands) {
    //         ssh.execCommand(command.data);
    //       }
    //     });

    //   }
    // }
  }
}

import { exec, execSync } from "child_process";
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
  paths: ConfigPathsJson;
  iso?: string;
  auth?: ConfigAuthJson;
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

    if (json.auth) this.auth = json.auth; //TODO: inherit auth from parent if not overriden by child

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

    //TODO: detect image needs installation somehow
    let needsInstalled = true;
    if (this.iso && needsInstalled) {
      let isoFilePath: string;
      if (isAbsolutePath(this.iso)) {
        isoFilePath = this.iso;
      } else {
        isoFilePath = resolvePath(__dirname, "..", this.iso);
      }

      let portSSH = 22;
      let portForwardSSH = 10022;

      let bootInstallCmd = `"${this.paths.qemu["qemu-system"]}" `;
      if (this.kvm) bootInstallCmd += "-enable-kvm -cpu host ";
      bootInstallCmd +=
      "-boot menu=on " +
      "-boot order=d " +
      `-cdrom ${isoFilePath} ` +
      `-drive file=${diskFileName},format=qcow2 ` +
      "-m 2G " +
      `-nic user,hostfwd=tcp::${portForwardSSH}-:${portSSH}`;

      console.log("Running", bootInstallCmd);
      if (!dry) {
        try {
          exec(bootInstallCmd, (err, stdout, stderr)=>{
            if (stdout) console.log(stdout);
            if (stderr) console.warn(stderr);
            if (err) console.error(err);
          });
          // execSync(bootInstallCmd);
        } catch (ex) {
          console.error("failed to run iso install", ex);
          return;
        }
      }
    } else {
      let bootCmd = `"${this.paths.qemu["qemu-system"]}" `;
      if (this.kvm) bootCmd += "-cpu host -enable-kvm ";
      bootCmd +=
      "-boot menu=on " +
      "-boot order=d " +
      `-drive file=${diskFileName},format=qcow2 ` +
      "-m 2G " +
      //"-curses " +
      "-net user,hostfwd=tcp::10022-:22 " +
      "-net nic";

      console.log("Running", bootCmd);

      if (!dry) {
        try {
          exec(bootCmd, (err, stdout, stderr)=>{
            if (stdout) console.log(stdout);
            if (stderr) console.warn(stderr);
            if (err) console.error(err);
          });
          // execSync(bootCmd);
        } catch (ex) {
          console.error("failed to boot disk image", ex);
          return;
        }
      }

    }

    if (this.commands) {
      if (!dry) {
        let ssh = new NodeSSH();

        let password: string;
        let username: string;
        if (this.auth.required) {
          password = this.auth.password;
          username = this.auth.user;
        }
        
        ssh.connect({
          host: "localhost",
          
          //undefined when !auth.required
          username: this.auth.user,
          password: this.auth.password

        }).then(()=>{
          for (let command of this.commands) {
            ssh.execCommand(command.data);
          }
        });

      }
    }
  }
}
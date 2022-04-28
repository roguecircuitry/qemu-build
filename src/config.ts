
export interface ConfigAuthJson {
  "required": boolean;
  "user": string;
  "password": string;
}

export interface ConfigPathsJson {
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
  "paths": ConfigPathsJson;
  "auth": ConfigAuthJson;
}
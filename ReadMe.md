# roguecircuitry/qemu-build

A build tool to automate qemu for VM creation, similar to how docker performs

```ts

import { build, ImageJson } from "qemu-build";

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

```

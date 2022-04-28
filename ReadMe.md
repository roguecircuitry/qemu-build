# roguecircuitry/qemu-build

A build tool to automate qemu for VM creation, similar to how docker performs

## State
- parses image definition JSON
- image create
- install ISO
- KVM options

## TODO
- image fork
- authentication options
- command running
- ssh

## Examples
Example of VM build instructions:
- [archtest.win.json](./archtest.win.json)

Example run of command:
`.\qemu-build.bat -def="tinycorelinux.win.json"` or `./qemu-build.sh -def="tinycorelinux.linux.json"`

[img](./example.png)


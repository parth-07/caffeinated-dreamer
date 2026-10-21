---
layout: default
title: RISCV relaxations overview call, global-pointer and zero-page relaxations
---

# RISCV relaxations overview: call, global-pointer and zero-page relaxations

RISCV architecture makes the best use of linker by designing the architecture
such that the compiler generates conservative code because it does not know
the complete layout and the linker relaxes the conservative code to more optimal
code using the knowledge of the complete layout.

All architecture do this to some extent, but none does it as well as RISCV.

In this blog post, we will look at different types of RISCV relaxations. The
goal is not to dive deep, just to see the variety of RISCV relaxations.

We will ignore the usual GOT-indirect read instruction relaxation to
direct-read instruction, as that is common to most of the architectures.

We will see hands-on example with each relaxation because that is the best way
to understand anything in tech.

## Call relaxations

Call relaxations relaxes call instructions. Not too surprising. The key idea is
that for a call instruction such as `call foo`, the compiler does not know the
address of `foo` and thus has to emit instruction that can store any (most?) address
in the valid address space.

`call` is a pseudo-instruction in RISCV. RISCV actually uses `auipc + jalr`
instruction pair to call a function that can be *mostly* anywhere in the valid
address space.

Let's see the range of addresses that can be stored via `auipc + jalr`.
`auipc` can store a 20 bits signed immediate that is left-shifted by 12 bits,
whereas `jalr` can store a 12 bits immediate. Let's compute:

```
; Highest address
PC + 0x7ffff000 + 0x7ff
PC + 0x7ffff7ff

; Lowest address
PC - 0x80000000 - 0x800
PC - 0x80000800
```

So, the range of addresses is `[PC - 0x80000800, PC + 0x7ffff7ff]`. This roughly
corresponds to PC +- 2GiB.


Now, riscv also has an another nice call-related instruction `jal`, whose
immediate is of 20-bits that is left-shifted by 1-bit as the addresses
are always even. `jal` instruction jump range is: `[PC - 0x100000, PC + 0xffffe]`.
This roughly corresponds to PC +- 1 MiB. **If the `auipc + jalr` call instruction target
falls within the range of `jal` instruction, then linker can relax `auipc + jalr`
instruction pair to `jal` and save 4 bytes!**

Now, let's see this in-action with the help of an example:

```bash
#!/usr/bin/env bash

cat >1.s <<\EOF
    .option relax

    .section .text.foo,"ax",%progbits
    .global foo
foo:
    call bar

    .section .text.bar,"ax",%progbits
    .global bar
bar:
  ret
EOF

cat >script.t <<\EOF
SECTIONS {
  .text.foo 0x0 : { *(.text.foo) }
  .text.bar 0xffffe : { *(.text.bar) }
}
EOF

clang -target riscv64-unknown-elf 1.s -o 1.o -c
ld.eld -o 1.out 1.o -T script.t

llvm-objdump -dr 1.out
```

<details markdown="1">
  <summary> Here's the output: </summary>

```
+ cat
+ cat
+ clang -target riscv64-unknown-elf 1.s -o 1.o -c
+ ld.eld -o 1.out 1.o -T script.t
+ llvm-objdump -dr 1.out

1.out:	file format elf64-littleriscv

Disassembly of section .text.foo:

0000000000000000 <foo>:
       0: 7ffff0ef     	jal	0xffffe <bar>

Disassembly of section .text.bar:

00000000000ffffe <bar>:
   ffffe: 8082         	ret
```
</details>

One interesting thing to note here is that the relaxation does not happen
when call is directly expressed using `auipc + jalr` in the assembly.
This is because `auipc + jalr` results in `R_RISCV_PCREL_HI20 + R_RISCV_PCREL_LO12_I`
relocation pair but the call relaxation is applied on `R_RISCV_CALL` relocation.
In assembly, using the `call` pseudo-instruction results in `R_RISCV_CALL` relocation.

## Global pointer relaxations

Global pointer relaxation can relax load-store instruction pairs such as
`auipc + lw` and `lui + lw` into a single instruction that refers to the
address relative to the global-pointer. This relaxation can be performed when
the address is in-range for `lw t1, <offset>(gp)` or `sw t1, <offset>(gp)`.
That is, the address is in range `[gp - 0x800, gp + 0x7ff]`. This roughly
corresponds to +-2KiB from the global pointer (`gp`).

One important thing to note here is that the linker does not set/know the value of
global pointer register. Instead, the linker sets the value of `__global_pointer$`
symbol and use it as the value of the `gp` for relaxations. It is runtime's responsibility
to ensure that the `gp` is correctly set to `__global_pointer$`.

Now, let's see this relaxation in-action:

```bash
#!/usr/bin/env bash

cat >1.s <<\EOF
    .option relax

    .section .text.foo,"ax",%progbits
    .global foo
foo:
  lui a0, %hi(bar)
  lw a0, %lo(bar)(a0)
EOF

cat >script.t <<\EOF
SECTIONS {
  .text.foo 0x0 : { *(.text*) }
  __global_pointer$ = 0x4000;
  bar = 0x47fe;
}
EOF

clang -target riscv64-unknown-elf 1.s -o 1.o -c
ld.eld -o 1.out 1.o -T script.t

llvm-objdump -dr 1.out
```

<details markdown="1">
  <summary> Here's the output: </summary>

```
+ cat
+ cat
+ clang -target riscv64-unknown-elf 1.s -o 1.o -c
+ ld.eld -o 1.out 1.o -T script.t
+ llvm-objdump -dr 1.out

1.out:	file format elf64-littleriscv

Disassembly of section .text.foo:

0000000000000000 <foo>:
       0: 7fe1a503     	lw	a0, 0x7fe(gp)
```
</details>

<details markdown="1">
  <summary>
    Now, if we slightly increase the value of `bar` to `0x4800`, then the linker will (as expected) no longer perform the relaxation:
  </summary>

```bash
#!/usr/bin/env bash

cat >1.s <<\EOF
    .option relax

    .section .text.foo,"ax",%progbits
    .global foo
foo:
  lui a0, %hi(bar)
  lw a0, %lo(bar)(a0)
EOF

cat >script.t <<\EOF
SECTIONS {
  .text.foo 0x0 : { *(.text*) }
  __global_pointer$ = 0x4000;
  bar = 0x4800;
}
EOF

clang -target riscv64-unknown-elf 1.s -o 1.o -c
ld.eld -o 1.out 1.o -T script.t

llvm-objdump -dr 1.out
```

Output:

```
+ cat
+ cat
+ clang -target riscv64-unknown-elf 1.s -o 1.o -c
+ ld.eld -o 1.out 1.o -T script.t
+ llvm-objdump -dr 1.out

1.out:	file format elf64-littleriscv

Disassembly of section .text.foo:

0000000000000000 <foo>:
       0: 6515         	lui	a0, 0x5
       2: 80052503     	lw	a0, -0x800(a0)
```
</details>

## Zero page relaxation

Zero page relaxation relaxes position-dependent load-store instruction pairs
such as `lui + lw`and `lui + sw` into a single instruction that refers to the
address relative to the `x0` register. Hence, this relaxation can be performed
when the address in in range `[-0x800, 0x7ff]`.

Do note that this relaxation cannot performed for the corresponding
position-independent pairs (`auipc + lw` and `auipc + sw`). This is because
the relaxed instruction is position-dependent (relative to `x0` is absolute address!),
and hence, if relaxation is performed then we are breaking the position-independence
of the original program.

Now, let's see this relaxation in action:

```bash
#!/usr/bin/env bash

cat >1.s <<\EOF
    .option relax

    .section .text.foo,"ax",%progbits
    .global foo
foo:
  lui a0, %hi(bar)
  lw a0, %lo(bar)(a0)
EOF

cat >script.t <<\EOF
SECTIONS {
  .text.foo 0x0 : { *(.text*) }
  bar = 0x7fe;
}
EOF

clang -target riscv64-unknown-elf 1.s -o 1.o -c
ld.eld -o 1.out 1.o -T script.t

llvm-objdump -dr 1.out
```

<details markdown="1">
  <summary>
  Here's the output:
  </summary>

```
+ cat
+ cat
+ clang -target riscv64-unknown-elf 1.s -o 1.o -c
+ ld.eld -o 1.out 1.o -T script.t
+ llvm-objdump -dr 1.out

1.out:	file format elf64-littleriscv

Disassembly of section .text.foo:

0000000000000000 <foo>:
       0: 7fe02503     	lw	a0, 0x7fe(zero)
```
</details>

<details markdown="1">

<summary>
Now, if we slightly increase the value of `bar` to `0x800`, then the linker
will (as expected) no longer perform the relaxation:
</summary>

```bash
#!/usr/bin/env bash

cat >1.s <<\EOF
    .option relax

    .section .text.foo,"ax",%progbits
    .global foo
foo:
  lui a0, %hi(bar)
  lw a0, %lo(bar)(a0)
EOF

cat >script.t <<\EOF
SECTIONS {
  .text.foo 0x0 : { *(.text*) }
  bar = 0x800;
}
EOF

clang -target riscv64-unknown-elf 1.s -o 1.o -c
ld.eld -o 1.out 1.o -T script.t

llvm-objdump -dr 1.out
```

Output:

```
+ cat
+ cat
+ clang -target riscv64-unknown-elf 1.s -o 1.o -c
+ ld.eld -o 1.out 1.o -T script.t
+ llvm-objdump -dr 1.out

1.out:	file format elf64-littleriscv

Disassembly of section .text.foo:

0000000000000000 <foo>:
       0: 6505         	lui	a0, 0x1
       2: 80052503     	lw	a0, -0x800(a0)
```
</details>



---
layout: default
title: How is a shared-library defined function address computed in a non-pic executable?
---

# How is a shared-library defined function address computed in a non-pic executable?

Today I discovered yet another cool thing that the linker and loader do to
provide correctness while preserving performance as much as possible.
This cool thing is called canonical PLT.

Generally, a shared library defined function address is computed through
GOT-indirection. So if there is a C code `&foo`, then it essentially gets
translated to `GOT[foo]`. `GOT[foo]` is filled with the resolved value of
`foo` at runtime by the loader.

However, in non-pic programs, the function address computation do not use
GOT-indirection. The linker has to fill the address of `foo` at link time
itself. It is a little problematic because the address of `foo`, a shared
library defined function, is not known until runtime.

It may seem that a linker can simply use `PLT[foo]` address as the address
of `foo` in non-pic programs. After all `PLT[foo]` is already used in non-pic
programs to call preemptible functions. It sounds reasonable. But is it
reasonable and correct in all the scenarios?

Let's take a little weird but not all that unreasonable case:
Consider a function `foo` defined in a shared library lib1.so.
We take the address of `foo` in both the shared library lib1.so and the non-pic
executable `main.out`. Both addresses should ideally be the same as they point to
the same symbol `foo`. But will they be the same if we use `PLT[foo]` as the address
in non-pic executable?

```
┌────────────┐
│            │
│0x1000: foo │
│            │     ┌─────────┐
│   &foo─────┼────►│ 0x1000  │
└────────────┘     └─────────┘
     lib1.so         GOT[foo]


  ┌────────┐
  │  &foo  ┼──────► main.out(PLT[foo])
  └────────┘
   main.out
```

Here is the conundrum:

`&foo` in shared library uses a GOT-slot indirection and ideally returns the actual
resolved function address.

non-pic executable instead uses the `PLT[foo]` address as the address of `foo`. Remember
that each module has its own PLT table. So, if at runtime, there is an executable and
4 shared libraries, then there will be 5 PLT tables.

**Thus, simply using `PLT[foo]` as the address of `foo` can cause inconsistent function address.
How can this be resolved?**

## Understanding the problem in detail

Let's analyzing this problem in detail by deep diving into assembly
with the help of an example. We will use ARM here. The core issue is the
same for AArch64, and riscv as well.

<!-- TODO: mention that x86-64 does not have this issue! -->

```bash
#/usr/bin/env bash
set -x

cat >1.c <<\EOF
int foo() {
  return 1;
}

int (*foo_addr())(){
  return foo;
}
EOF

cat >main.c <<\EOF
#include <stdio.h>

int foo();
int (*foo_addr())();

int main() {
  printf("foo address: %p %p\n", &foo, foo_addr());
  return 0;
}
EOF

arm-none-linux-gnueabihf-gcc -o 1.o 1.c -c -fPIC
arm-none-linux-gnueabihf-gcc -o lib1.so 1.o -shared

arm-none-linux-gnueabihf-gcc -o main.o main.c -c -fno-PIC
arm-none-linux-gnueabihf-gcc -o main.out main.o lib1.so

LD_LIBRARY_PATH="$(pwd):${LD_LIBRARY_PATH}" qemu-arm-linux ./main.out
```

To run this example, you will need a GNU ARM toolchain and replace `qemu-arm-linux`
with `qemu-arm -L ${GCC_ARM_LINUX_SYSROOT}`.

The above example outputs:

```
foo address: 0x103d0 0x103d0
```

Yay! The `foo` address is the same.

But how exactly is the address of `foo` getting resolved here?

Let's start with lib1.so.

`lib1.so(foo_addr)` obtains `foo` address through GOT-slot.

<details markdown="1">
  <summary> Expand to see it in action </summary>

`llvm-objdump -dr lib1.so` gives us:

```
000003c6 <foo_addr>:
3c6: b480         	push	{r7}
3c8: af00         	add	r7, sp, #0x0
3ca: 4a04         	ldr	r2, [pc, #0x10]         @ 0x3dc <foo_addr+0x16>
3cc: 447a         	add	r2, pc
3ce: 4b04         	ldr	r3, [pc, #0x10]         @ 0x3e0 <foo_addr+0x1a>
3d0: 58d3         	ldr	r3, [r2, r3]
3d2: 4618         	mov	r0, r3
3d4: 46bd         	mov	sp, r7
3d6: bc80         	pop	{r7}
3d8: 4770         	bx	lr
3da: bf00         	nop
3dc: 30 1c 00 00  	.word	0x00001c30
3e0: 20 00 00 00  	.word	0x00000020
```

Let's go over some of the relevant instructions here:

```
3ca: ldr r2, [pc, #0x10]
```
r2 = load(PC + 0x10)
effective PC here as per thumb state rules =  align(CurAddr + 4, 4), that is, 0x3cc
r2 = load(0x3cc + 0x10)
r2 = load(0x3dc)
r2 = 0x1c30

```
3cc: add r2, pc
```

r2 = r2 + PC
r2 = r2 + align(CurAddr + 4, 4)
r2 = 0x1c30 + 0x3d0
r2 = 0x2000

```
3ce: ldr	r3, [pc, #0x10]
```

r3 = load(align(PC, 4) + 0x10)
r3 = load(0x3d0 + 0x10)
r3 = load(0x3e0)
r3 = 0x20

```
3d0: ldr	r3, [r2, r3]
```

r3 = load(r2 + r3)
r3 = load(0x2000 + 0x20)
r3 = load(0x2020)

What is at address 0x2020? As we discussed before, it must be GOT slot for `foo`.

```
$ llvm-readelf -r lib1.so | grep -i foo

00002020  00000815 R_ARM_GLOB_DAT         000003b9   foo
```

And we were right!

</details>
<br/>

Now let's look at the more interesting case: what's happening in our non-pic main executable?
`&foo` should not be getting the address from GOT because compiler should have emitted non-GOT
instructions for `&foo` code.

This is our main function objdump output:

```
000104b8 <main>:
104b8: b580         	push	{r7, lr}
104ba: af00         	add	r7, sp, #0x0
104bc: f7ff ef7c    	blx	0x103b8 <foo_addr@plt>  @ imm = #-0x108
104c0: 4603         	mov	r3, r0
104c2: 461a         	mov	r2, r3
104c4: f240 31d0    	movw	r1, #0x3d0
104c8: f2c0 0101    	movt	r1, #0x1
104cc: f240 507c    	movw	r0, #0x57c
104d0: f2c0 0001    	movt	r0, #0x1
104d4: f7ff ef6a    	blx	0x103ac <printf@plt>    @ imm = #-0x12c
104d8: 2300         	movs	r3, #0x0
104da: 4618         	mov	r0, r3
104dc: bd80         	pop	{r7, pc}
```

Here the linker has resolved the address of foo to `PLT[foo]`, as we expected.

<details markdown=1>
<summary> Expand to see what's happening here in detail </summary>

Remember that the original key code here is: `printf("foo address: %p %p\n", &foo, foo_addr());`

`&foo` argument value is stored in `r1` and it is computed as:

```
104c4: movw r1, #0x3d0
104c8: movt r1, #0x1
```

r1 = 0x10000 + 0x3d0
r1 = 0x103d0

`r1` contains the address of `main.out(foo@plt)`. We can confirm that 0x103d0
is `foo@PLT` by using readelf as shown below.

```
$ llvm-readelf -r main.out | grep -i foo

00012014  00000416 R_ARM_JUMP_SLOT        00000000   foo_addr
0001201c  00000516 R_ARM_JUMP_SLOT        000103d0   foo
```
</details>
<br/>

**So let's consolidate the facts that we learned:**

- `&foo` in a shared library uses GOT-indirection to get the address of `foo`.
  The evaluated value typically is the actual address of the resolved `foo`.
- `&foo` in a non-pic executable cannot use GOT-indirection because the compiler does
  not emit GOT-load instructions. In this case, `&foo` evaluates to `main.out(foo@PLT)`

So how is `lib1.so(&foo)` and `main.out(&foo)` equal?

## Canonical PLTs

The key idea here is: can we use `main.out(foo@PLT)` address wherever the `&foo` needs to be
evaluated? The loader knows the value of `main.out(foo@PLT)` and loader effectively decides
the evaluated value of `&foo` in shared libraries, by filling the corresponding GOT-slot.

What if the main is position-independent executable? In that case, the executable will also
evaluate `&foo` through GOT-slot and `&foo` evaluations will naturally be the same in shared
library and (pic) executables. In such a case, it is not beneficial to use `main.out(foo@PLT)`
address everywhere. It is not harmless either because now the function calls through these addresses
will unncessary go through the PLT-stub.

So, how can the loader decide when to use `main.out(foo@PLT)` address for resolving `&foo` everywhere?

Here the key idea is that the linker can somehow pass some extra information
to the loader using which it can decide how to resolve symbol addresses. Or more
precisely, how to evaluate the `GLOB_DAT` relocations.

Linker can mark a PLT as a canonical PLT. The canonical PLT address is then used as the address
of the symbol in all the modules. If no canonical PLT is present, then as usual, the actual
address of the resolved symbol is used as the address of the symbol.

Linker marks a PLT as a canonical PLT by adding a value for the PLT's symbol entry in the dynamic symbol table. Yes, that's it.

```
$ llvm-readelf --dyn-syms main.out

Symbol table '.dynsym' contains 9 entries:
 Num:    Value  Size Type    Bind   Vis       Ndx Name
   0: 00000000     0 NOTYPE  LOCAL  DEFAULT   UND
   1: 00000000     0 NOTYPE  WEAK   DEFAULT   UND _ITM_deregisterTMCloneTable
   2: 00000000     0 NOTYPE  WEAK   DEFAULT   UND __gmon_start__
   3: 00000000     0 NOTYPE  WEAK   DEFAULT   UND _ITM_registerTMCloneTable
   4: 00000000     0 FUNC    GLOBAL DEFAULT   UND foo_addr
   5: 000103d0     0 FUNC    GLOBAL DEFAULT   UND foo
   6: 00000000     0 FUNC    GLOBAL DEFAULT   UND printf@GLIBC_2.4
   7: 00000000     0 FUNC    GLOBAL DEFAULT   UND abort@GLIBC_2.4
   8: 00000000     0 FUNC    GLOBAL DEFAULT   UND __libc_start_main@GLIBC_2.34
```

In the dynamic symbol table, `foo` an `UND` symbol has a non-zero value. This value is the address
of `main.o(foo@PLT)`.

Now, when the loader is resolving `GLOB_DAT` relocation for `foo`. It will iterate
over the runtime modules as usual and will select the first `foo` with non-`0`
value. This will always select the executable `foo` because the executable is
always at the start of the runtime modules sequence.

## Devil is in the details

Here we will deep dive into the internal implementation details.
Feel free to skip this unless you are really curious about how
things work under the hood.

So, now we know that whenever a non-pic executable access address of a function
that is defined in a shared library, linker can use the PLT stub for the address
and mark the PLT as canonical for ensuring address-equality. However, what
are all the conditions/constraints that must be satisfied for a linker
to create a PLT stub and mark it as canonical?

For now, we have:

- **A non-pic (non-pie) executable access address of a function (`&foo`)
  that is defined in a shared library.**

Here's an interesting counter-case: if there is a defined global variable,
such as shown below, in our non-pie executable, then the corresponding
relocatable object file would have an `ABS` relocation to fill the initial
contents of `foo_p` and the linker will add a corresponding `ABS` dynamic relocation
to fill the value of `foo_p` because the linker cannot resolve the address
of `foo` at link-time. Here the linker can add a dynamic relocation rather easily
because `.data` section is writeable at runtime.

In this case, we do not need canonical PLT because the dynamic linker
can resolve the `foo_p` to the resolved `foo` address at runtime when
resolving the corresponding `ABS` relocation.

```cpp
int (*foo_p)() = foo;
```

Thus, we have one more condition for marking a PLT stub as canonical:

- **There should be a non-got non-call reference to the symbol and the reference
  does not have a corresponding dynamic relocation.**

Another interesting catch here is that **the linker needs to create a PLT stub
for a symbol even for non-call relocations if canonical PLT is required.**

### Linker flow

Now let's take a look at the link flow for implementing canonical PLT functionality.

```
┌───────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│Scan relocation┼─────►Perform layout┼─────► Apply relocation┼─────► Write output image  │
└───────────────┘     └──────────────┘     └─────────────────┘     └─────────────────────┘
```

Scan relocation is the most important phase for canonical PLT functionality.
Scan relocation decides whether a PLT/GOT slot needs to be created for a symbol.
Linker at this phase can see whether there is any non-call non-GOT relocation
to a shared library defined symbol, and if so, mark that symbol/PLT-slot with
canonical-PLT flag.

Later in the writing output image phase when the linker is emitting the dynamic
symbol table, the linker can see whether a dynamic symbol is marked with canonical-PLT
and if it is, then set the symbol value to the PLT slot for the symbol.



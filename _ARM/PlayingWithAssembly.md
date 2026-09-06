# Understanding compiler-emitted assembly for standard cases

For ARM state, PC = current_instruction_address + 8

## non-PIC code

### variable access


```
// in a function!
// int v = u;
14: ldr r0, [pc, #0x28]
18: ldr r0, [r0]
...
...
44: 00 00 00 00
    R_ARM_ABS32 u
```

### function call

```
// foo()
20: bl 0x20
    20: R_ARM_CALL foo
```

## PIC-code

### variable access

```
// in a function!
14: ldr r0, [pc, #0x2c]
18: ldr r0, [pc, r0]
...
...
48: 00 00 00 00
    R_ARM_GOT_PREL u

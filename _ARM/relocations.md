# Relocations

## Branch relocations

### CALL

Function call relocation using `bl` and `blx` instructions.

`S + A - P`

GOT slot: no
PLT slot: possibly yes.

typical use:

```
bl foo
```

### JUMP24

Compiler can produce it for things such as tail calls.

GOT slot: no
PLT slot: possibly yes.

typical use:

```
b foo
```


## Absolute and relative relocations

### PC24

Deprecated.

### ABS32

`S + A`

writes a 32-bit absolute symbol address.

GOT slot: no
PLT slot: possibly yes, if canonical PLT is required.

use:

```
foo_addr:
  .word foo
```

### REL32

`S + A - P`

GOT slot: no
PLT slot: possibly yes, if canonical PLT is required.

use:

```
foo_rel_addr:
  .word foo - .
```

### MOVW_ABS_NC / MOVT_ABS

Relocation pair to form 32-bit values.

GOT: no
PLT: possibly yes, if canonical PLT is required.




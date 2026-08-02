---
layout: post
title:  "Practical Linker Bytes: Weak symbols"
---

Weak symbols are just what the name suggests — they are weak. They go to the gym less often.
Sometimes skips the gym completely.

You may have heard the term `weak` symbol occasionally. If you are unsure of what they are
and/or what they are good for, this blog might be helpful.

In the holy bible ELF, symbols have a property called symbol binding. The symbol binding
determines whether a symbol is “visible” outside its translation unit or not
(then what is the symbol visibility for? huh!). The symbol binding can have three
values: `global`, `weak`, and `local`. `global` and `weak` symbols are visible outside
their translation unit. `local` symbols are not.

```bash
#!/usr/bin/env bash

cat>1.c <<\EOF
int foo() { return 1; }
__attribute__((weak)) int bar() { return 3; }
static int baz() { return 5; }
EOF

gcc -o 1.o 1.c -c
readelf -s 1.o

# readelf output:
# ...
# ...
# 3: 0000000000000016    11 FUNC    LOCAL  DEFAULT    1 baz
# 4: 0000000000000000    11 FUNC    GLOBAL DEFAULT    1 foo
# 5: 000000000000000b    11 FUNC    WEAK   DEFAULT    1 bar
```

The key differences between `global` and `weak` symbol are:
- It is an error to have multiple defined `global` symbols of the same name. It is allowed
  to have multiple defined `weak` symbols of the same name. In this case, the linker resolves
  the symbol name to the first `weak` symbol of the name that it sees. When we have
  a defined `global` and a defined `weak` symbol of the same name, then the `global` definition
  wins.
- It is an error have an undefined `global` symbol reference to be unsatisifed. It is allowed
  to have undefined `weak` symbol references. Their value is considered to be 0.
- An undefined `global` symbol reference is a candidate for pulling an archive member,
  whereas an undefined `weak` symbol reference is not.

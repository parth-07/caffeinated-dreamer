# Instructions

## push

## mov

`rd` = `rs`

```
mv rd, rs
```

## bl

Branch with link.

Stores the return address in thel Link Register (LR) (R14). Branches to the target label.

```
bl foo
```

## str

Store from register into memory.

memory[`Rd`] = `Rn`

```
str Rn, [Rd]
```

## ldr

Load into register. Loads data from memory into a register.

`Rd` = memory[`Rn`]

```
ldr Rd, [Rn]
```

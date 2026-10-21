---
layout: post
title: "C++ pitfalls: arithmetic evaluation with unsigned and signed values"
---

# Arithmetic evaluation of unsigned and signed values in C++

C++ is well-known for not missing opportunities that encourages its developers to
shoot themselves in the foot. This blog post is yet another reminder for why C++
is well-known for this.

Let's consider this simple case: there are two variables: `uint64_t u` and `int64_t v`,
and we want to add them and store the result as `uint64_t` value, and this value should
be 0 if the sum of `u` and `v` comes out to be negative. Sounds simple enough? 
Perhaps. However, we should not forget that we are using C++.

Let's see how can do this comparison.

```cpp
uint64_t u = ...;
int64_t v = ...;

uint64_t r = std::max(0, u + v);
```

This seems correct at a glance, but only at a glance. 

C/C++ requires arithmetic operator operands to be of the same type, and if they are not
then they are implicitly converted to be of the same type. In this case, `v` will be 
[implicitly converted](https://en.cppreference.com/c/language/conversion) to `uint64_t`. 
So what's the problem? 

We cannot (should not) directly evaluate unsigned and signed integers because in C/C++ the 
bits of signed and unsigned integers are interpreted differently. Implicit conversion of an 
`int64_t` value to `uint64_t` value may not always be what we expect it to be. 

As a concrete example, let's consider the value of `u` to be 1 and the value of `v` to be `-1`. 
In this case, the expression `u + v` will be equivalent to `1 + 2^64 - 1` because `2^64 - 1` is the value
that is obtained after converting `-1` to `uint64_t`. 

So clearly, we cannot use the good and simple `u + v`. How about we explicitly perform
the casting here depending upon whether `v` is positive or negative so that we can maintain
the correct semantics here?

```cpp
uint64_t u = ...;
int64_t v = ...;
uint64_t r = 0;

if (v >= 0) {
  r = u + v;
} else {
  uint64_t abs_value = -v;
  if (u > abs_value)
    r = u - abs_value;
}
```

This is certainly better than the last approach. Here we correctly perform the sum when
`v` is a negative integer. However, is it correct? Do you remember that we are still using C++?

Consider the value of `v` is -2^63, now what will be the value of `-v`? Do you remember the overflow
on [signed integers arithmetic operation is an undefined behavior](https://en.cppreference.com/c/language/operator_arithmetic)?
This finding is especially important considering the library functions such as `std::abs` have
the same limitation. 

Yes, our innocent summation code has an undefined behaviour. How to fix it? The key idea is that
unsigned integer arithmetic operation is always a defined behaviour. When overflow (or underflow)
happens for unsigned integer arithmetic operation, then the result is computed by performing
modulo 2^N on the arithmetic operation value where n is the number of bits in the unsigned type.

To make our summation program well-defined, we have to compute `abs_value` without triggering
any undefined behaviour. Here's the final program:

```cpp
uint64_t u = ...;
int64_t v = ...;
uint64_t r = 0;

if (v >= 0) {
  r = u + v;
} else {
  uint64_t abs_value = static_cast<uint64_t>(0) - static_cast<uint64_t>(v);
  if (u > abs_value)
    r = u - abs_value;
}
```



# rustc Atlas

An interactive **map of the Rust compiler**, to help newcomers find their way
around it.

The Rust compiler is a huge pile of code — hundreds of folders. This project
draws it as a map:

- each part of the compiler is a **box**,
- **lines** between boxes show which parts rely on which,
- **clicking a box** shows what's inside it.

## What we're building first (Milestone 0)

The smallest version that proves the whole idea works, end to end. Two pieces
that hand off to each other:

1. **A small program** you run on a Rust codebase. It reads the code and writes
   out **one data file** listing: what the parts are, which parts depend on
   which, and what's inside each part.
2. **A small website** that opens that data file and draws the map from it.

**Success:** run the program on a real Rust project, open the website, and see
the *real* parts of that project and what's inside them — nothing faked.

The website never has to understand code. It only reads that one tidy file. The
program does all the hard work of reading code; the website just draws.

## Out of scope for now

How code turns into a running program, links to GitHub, learning paths, and the
rest of the long-term plan. Deliberately ignored until the basics work.

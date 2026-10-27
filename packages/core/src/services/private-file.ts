/** Write secrets without exposing new or previously permissive files to other users. */
export const writePrivateFileSync = (fs: any, filePath: string, content: string | Uint8Array): void => {
  // Do not truncate until the opened inode has been checked and its permissions tightened.
  // O_NONBLOCK avoids hanging when an attacker substitutes a FIFO for a credential file.
  // fs.open requires a bitmask when combining these operating-system flags.
  // eslint-disable-next-line no-bitwise
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
  const fd = fs.openSync(filePath, flags, 0o600);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || (typeof process.geteuid === "function" && stat.uid !== process.geteuid())) {
      throw new Error("Refusing to write secrets to a non-private regular file");
    }
    if (process.platform !== "win32") {
      fs.fchmodSync(fd, 0o600);
    }
    fs.ftruncateSync(fd, 0);
    fs.writeFileSync(fd, content);
  } finally {
    fs.closeSync(fd);
  }
};

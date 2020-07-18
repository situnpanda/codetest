
import os
import sys
import hashlib

def dufile(parentFolder):
    dups = {}
    for dirName, subdir, fileList in os.walk(parentFolder):
        print('directory %s...' % dirName)
        for filename in fileList:
            # Get the path to the file
            path = os.path.join(dirName, filename)
            # Calculate hash
            file_hash = hashfile(path)
            # Add or append the file path
            if file_hash in dups:
                dups[file_hash].append(path)
            else:
                dups[file_hash] = [path]
    return dups
def hashfile(path, blocksize = 65536):
    afile = open(path, 'rb')
    hasher = hashlib.md5()
    buf = afile.read(blocksize)
    while len(buf) > 0:
        hasher.update(buf)
        buf = afile.read(blocksize)
    afile.close()
    return hasher.hexdigest()

if __name__ == '__main__':
    if len(sys.argv) > 1:
        dups = {}
        folder = sys.argv[1]
        if os.path.exists(folder):
            dufile(folder)
        else:
            print('%s is not a valid path, please verify' %folder)
            sys.exit()
        print(dups)
    else:
        print('Usage: python dupFinder.py folder or python dupFinder.py folder1 ')
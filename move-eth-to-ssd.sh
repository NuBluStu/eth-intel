#!/bin/bash

# Move ETH data from internal drive to external APFS SSD
# This script uses rsync to safely move data with progress monitoring

echo "========================================="
echo "ETH Data Migration to External SSD"
echo "========================================="
echo ""
echo "From: ~/ETH (internal drive)"
echo "To:   /Volumes/X9 Pro/ETH (external SSD)"
echo ""

# Check if source exists
if [ ! -d ~/ETH ]; then
    echo "Error: Source directory ~/ETH does not exist!"
    exit 1
fi

# Check if destination volume exists
if [ ! -d "/Volumes/X9 Pro" ]; then
    echo "Error: External SSD '/Volumes/X9 Pro' not mounted!"
    exit 1
fi

# Get size of data to move
echo "Calculating data size..."
SIZE=$(du -sh ~/ETH | cut -f1)
echo "Data to move: $SIZE"
echo ""

read -p "Ready to start the move? This will take some time. (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Move cancelled."
    exit 0
fi

echo ""
echo "Starting data transfer with rsync..."
echo "This will show progress for each file..."
echo ""

# Create destination directory if it doesn't exist
mkdir -p "/Volumes/X9 Pro/ETH"

# Use rsync to copy data with progress
# -av: archive mode, verbose
# --progress: show progress for each file
# --stats: show summary statistics
rsync -av --progress --stats ~/ETH/ "/Volumes/X9 Pro/ETH/"

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================="
    echo "Transfer completed successfully!"
    echo "========================================="
    echo ""
    
    # Verify the data
    echo "Verifying data integrity..."
    SOURCE_COUNT=$(find ~/ETH -type f | wc -l | tr -d ' ')
    DEST_COUNT=$(find "/Volumes/X9 Pro/ETH" -type f | wc -l | tr -d ' ')
    
    echo "Source files: $SOURCE_COUNT"
    echo "Destination files: $DEST_COUNT"
    echo ""
    
    if [ "$SOURCE_COUNT" -eq "$DEST_COUNT" ]; then
        echo "File counts match! ✓"
        echo ""
        echo "The data has been successfully copied to the external SSD."
        echo ""
        read -p "Do you want to DELETE the original data from ~/ETH to free up space? (y/n): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Removing original data from ~/ETH..."
            rm -rf ~/ETH
            echo "Original data removed. You've freed up $SIZE of space!"
            echo ""
            echo "========================================="
            echo "Migration complete!"
            echo "========================================="
            echo ""
            echo "You can now run:"
            echo "  ./start-geth.sh      # Start Geth"
            echo "  ./start-lighthouse.sh # Start Lighthouse"
        else
            echo "Original data kept at ~/ETH"
            echo "Note: You now have duplicate data. Consider removing ~/ETH manually later."
        fi
    else
        echo "WARNING: File counts don't match!"
        echo "Please verify the transfer manually before removing original data."
    fi
else
    echo ""
    echo "Error: Transfer failed!"
    echo "Please check disk space and permissions, then try again."
    exit 1
fi
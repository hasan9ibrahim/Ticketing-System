import React, { useState } from 'react';
import { FileImage, MoreVertical, Copy, Download, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/**
 * CompactImageViewer - Displays images in a compact row format with options to copy/download
 * and click to view full-size in a lightbox modal
 * 
 * @param {Object[]} images - Array of image URLs
 * @param {string} title - Title for the image section
 */
const CompactImageViewer = ({ images, title = "Images" }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  if (!images || images.length === 0) {
    return null;
  }

  // Get file extension from URL or base64 data
  const getFileExtension = (url) => {
    if (url.startsWith('data:')) {
      // For base64 images, check the MIME type
      const mimeMatch = url.match(/data:([^;]+)/);
      if (mimeMatch) {
        const mime = mimeMatch[1];
        if (mime.includes('png')) return 'png';
        if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
        if (mime.includes('gif')) return 'gif';
        if (mime.includes('webp')) return 'webp';
      }
      return 'png'; // Default for data URLs
    }
    // For URL-based images
    const extension = url.split('.').pop()?.split('?')[0]?.toLowerCase();
    return extension === 'jpeg' ? 'jpg' : (extension || 'png');
  };

  // Open lightbox at selected index
  const openLightbox = (index) => {
    setSelectedImageIndex(index);
    setLightboxOpen(true);
  };

  // Copy image to clipboard
  const copyImage = async (url) => {
    try {
      // For data URLs, we need to fetch and convert
      if (url.startsWith('data:')) {
        const response = await fetch(url);
        const blob = await response.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ]);
      } else {
        // For regular URLs, fetch as blob first
        const response = await fetch(url);
        const blob = await response.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ]);
      }
      // Show in-app toast notification
      toast.success("Image copied to clipboard");
    } catch (error) {
      console.error('Failed to copy image:', error);
      // Fallback: copy image URL
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Image URL copied to clipboard");
      } catch (fallbackError) {
        console.error('Failed to copy URL:', fallbackError);
        toast.error("Failed to copy image to clipboard");
      }
    }
  };

  // Download image
  const downloadImage = (url, index) => {
    const extension = getFileExtension(url);
    const filename = `image_${index + 1}.${extension}`;
    
    if (url.startsWith('data:')) {
      // For data URLs
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // For regular URLs
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    
    // Show in-app toast notification
    toast.success(`Downloading ${filename}...`);
  };

  // Navigate to previous/next image in lightbox
  const navigateImage = (direction) => {
    const newIndex = selectedImageIndex + direction;
    if (newIndex >= 0 && newIndex < images.length) {
      setSelectedImageIndex(newIndex);
    }
  };

  return (
    <>
      <div className="border-t border-zinc-700 pt-4 mt-4">
        <label className="text-zinc-400 text-sm">{title} ({images.length})</label>
        <div className="mt-2 space-y-2">
          {images.map((image, index) => (
            <div
              key={index}
              className="flex items-center justify-between bg-zinc-800/50 rounded-lg p-2 border border-zinc-700 hover:border-zinc-500 transition-colors"
            >
              {/* Image preview - clickable to open lightbox */}
              <div 
                className="flex items-center gap-3 flex-1 cursor-pointer min-w-0"
                onClick={() => openLightbox(index)}
              >
                {/* Thumbnail */}
                <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-zinc-700">
                  <img
                    src={image}
                    alt={`Image ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* File info */}
                <div className="flex items-center gap-2 min-w-0">
                  <FileImage className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm text-white truncate">
                      image_{index + 1}.{getFileExtension(image)}
                    </span>
                    <span className="text-xs text-zinc-500">
                      Click to view
                    </span>
                  </div>
                </div>
              </div>

              {/* Dropdown menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0 text-zinc-400 hover:text-white hover:bg-zinc-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-zinc-800 border-zinc-700 text-white">
                  <DropdownMenuItem 
                    onClick={() => copyImage(image)}
                    className="cursor-pointer focus:bg-zinc-700 focus:text-white"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Image
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-zinc-700" />
                  <DropdownMenuItem 
                    onClick={() => downloadImage(image, index)}
                    className="cursor-pointer focus:bg-zinc-700 focus:text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox Modal */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl w-auto bg-black border-zinc-800 p-0 overflow-hidden" showCloseButton={false}>
          {/* Custom Close Button */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 z-20 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <DialogHeader className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4">
            <DialogTitle className="text-white text-sm">
              {selectedImageIndex + 1} / {images.length} - image_{selectedImageIndex + 1}.{getFileExtension(images[selectedImageIndex])}
            </DialogTitle>
          </DialogHeader>
          
          {/* Navigation buttons */}
          {images.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/50 text-white hover:bg-black/70 h-12 w-12"
                onClick={() => navigateImage(-1)}
                disabled={selectedImageIndex === 0}
              >
                ←
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/50 text-white hover:bg-black/70 h-12 w-12"
                onClick={() => navigateImage(1)}
                disabled={selectedImageIndex === images.length - 1}
              >
                →
              </Button>
            </>
          )}

          {/* Full-size image */}
          <div className="flex items-center justify-center min-h-[200px] min-w-[200px] max-h-[80vh] max-w-[90vw]">
            <img
              src={images[selectedImageIndex]}
              alt={`Image ${selectedImageIndex + 1}`}
              className="max-w-full max-h-[80vh] object-contain"
            />
          </div>

          {/* Action buttons at bottom */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 flex justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              className="bg-zinc-800 border-zinc-600 text-white hover:bg-zinc-700"
              onClick={() => copyImage(images[selectedImageIndex])}
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-zinc-800 border-zinc-600 text-white hover:bg-zinc-700"
              onClick={() => downloadImage(images[selectedImageIndex], selectedImageIndex)}
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CompactImageViewer;

import React, { useEffect, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';

// Modern replacement for react-slick's <Slider> built on embla-carousel-react.
// Honors the common settings: slidesToShow, autoplay, autoplaySpeed, infinite.
export default function Slider({
  children,
  slidesToShow = 1,
  autoplay = false,
  autoplaySpeed = 3000,
  infinite = true,
  ...rest
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: infinite, align: 'start' });

  const autoScroll = useCallback(() => {
    if (!emblaApi) return;
    if (emblaApi.canScrollNext()) emblaApi.scrollNext();
    else emblaApi.scrollTo(0);
  }, [emblaApi]);

  useEffect(() => {
    if (!autoplay || !emblaApi) return undefined;
    const id = setInterval(autoScroll, autoplaySpeed);
    return () => clearInterval(id);
  }, [autoplay, autoplaySpeed, emblaApi, autoScroll]);

  const basis = `${100 / Math.max(1, slidesToShow)}%`;

  return (
    <div className="embla" ref={emblaRef} style={{ overflow: 'hidden' }}>
      <div className="embla__container" style={{ display: 'flex' }}>
        {React.Children.map(children, (child, i) => (
          <div
            className="embla__slide"
            key={i}
            style={{ flex: `0 0 ${basis}`, minWidth: 0, boxSizing: 'border-box' }}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

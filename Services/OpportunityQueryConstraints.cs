using System.Text.RegularExpressions;
using RoofingCrm.Data;

namespace RoofingCrm.Services;

public static class OpportunityQueryConstraints
{
    private static readonly Dictionary<string, int> WordNumbers = new(StringComparer.OrdinalIgnoreCase)
    {
        ["one"] = 1, ["two"] = 2, ["three"] = 3, ["four"] = 4, ["five"] = 5,
        ["six"] = 6, ["seven"] = 7, ["eight"] = 8, ["nine"] = 9, ["ten"] = 10,
        ["fifteen"] = 15,
    };

    public sealed record Constraints(
        bool RequireOpenPermit,
        int? MinPermitOpenYears,
        bool PermitYearsExclusive,
        bool RequireAgingRoof,
        int? MinRoofAgeYears,
        bool RoofAgeYearsExclusive)
    {
        public bool HasRules => RequireOpenPermit || MinPermitOpenYears.HasValue || RequireAgingRoof || MinRoofAgeYears.HasValue;

        public bool Matches(RoofingKnowledgeSeed.Entry entry)
        {
            if (RequireOpenPermit && !entry.PermitOpen)
            {
                return false;
            }

            if (MinPermitOpenYears is int minPermit && minPermit > 0)
            {
                if (PermitYearsExclusive)
                {
                    if (entry.PermitOpenYears <= minPermit)
                    {
                        return false;
                    }
                }
                else if (entry.PermitOpenYears < minPermit)
                {
                    return false;
                }
            }

            if (MinRoofAgeYears is int minRoof && minRoof > 0)
            {
                if (RoofAgeYearsExclusive)
                {
                    if (entry.RoofAgeYears <= minRoof)
                    {
                        return false;
                    }
                }
                else if (entry.RoofAgeYears < minRoof)
                {
                    return false;
                }
            }

            if (RequireAgingRoof && !RequireOpenPermit && MinRoofAgeYears is null && entry.RoofAgeYears < 15)
            {
                return false;
            }

            return true;
        }
    }

    public static Constraints Parse(string prompt)
    {
        var lower = prompt.ToLowerInvariant();

        var requireOpenPermit =
            (lower.Contains("open") && lower.Contains("permit"))
            || lower.Contains("stalled")
            || lower.Contains("long-open");

        var requireAgingRoof =
            lower.Contains("aging")
            || lower.Contains("old roof")
            || (lower.Contains("older") && lower.Contains("roof"));

        var (minPermitYears, permitExclusive) = requireOpenPermit
            ? ExtractYearThreshold(prompt)
            : (null, false);
        (int? minRoofYears, bool roofExclusive) = (null, false);

        if (requireAgingRoof && lower.Contains("roof") && !requireOpenPermit)
        {
            (minRoofYears, roofExclusive) = ExtractYearThreshold(prompt);
            minRoofYears ??= 15;
        }

        return new Constraints(
            requireOpenPermit,
            minPermitYears,
            permitExclusive,
            requireAgingRoof,
            minRoofYears,
            roofExclusive);
    }

    private static (int? Years, bool Exclusive) ExtractYearThreshold(string text)
    {
        var digit = Regex.Match(
            text,
            @"(?<cmp>older\s+than|more\s+than|at\s+least|over)\s*(?<n>\d+)\s*years?",
            RegexOptions.IgnoreCase);
        if (digit.Success && int.TryParse(digit.Groups["n"].Value, out var years))
        {
            var exclusive = IsExclusiveComparator(digit.Groups["cmp"].Value);
            return (years, exclusive);
        }

        var word = Regex.Match(
            text,
            @"(?<cmp>older\s+than|more\s+than|at\s+least|over)\s+(?<w>[a-z]+)\s+years?",
            RegexOptions.IgnoreCase);
        if (word.Success && WordNumbers.TryGetValue(word.Groups["w"].Value, out var mapped))
        {
            var exclusive = IsExclusiveComparator(word.Groups["cmp"].Value);
            return (mapped, exclusive);
        }

        return (null, false);
    }

    private static bool IsExclusiveComparator(string comparator) =>
        comparator.Contains("older than", StringComparison.OrdinalIgnoreCase)
        || comparator.Contains("more than", StringComparison.OrdinalIgnoreCase);
}